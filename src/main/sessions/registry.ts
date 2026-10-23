// Sessões ativas (só em memória) e agrupamento da saída do terminal para o IPC.
import type { SessionKind, SessionStateEvent, TermSize } from '@shared/model/types';
import { fail } from '../ipc/messages';

export interface SessionHandle {
  readonly id: string;
  readonly kind: SessionKind;
  write(data: string): void;
  resize(size: TermSize): void;
  close(): void;
  reconnect?(): Promise<void>;
  /** Conta como atividade para a confirmação ao fechar (FR-028). */
  isActive(): boolean;
}

export interface RegistryEvents {
  data(sessionId: string, data: string): void;
  state(event: SessionStateEvent): void;
}

const FLUSH_MS = 8;
const FLUSH_BYTES = 64 * 1024;

export class SessionRegistry {
  private readonly sessions = new Map<string, SessionHandle>();
  private readonly pending = new Map<string, string[]>();
  private readonly pendingSize = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly events: RegistryEvents) {}

  add(handle: SessionHandle): void {
    this.sessions.set(handle.id, handle);
  }

  get(id: string): SessionHandle {
    const s = this.sessions.get(id);
    if (!s) throw fail('NOT_FOUND');
    return s;
  }

  remove(id: string): void {
    this.flushOne(id);
    this.sessions.delete(id);
  }

  all(): SessionHandle[] {
    return [...this.sessions.values()];
  }

  activeCount(): number {
    return this.all().filter((s) => s.isActive()).length;
  }

  emitState(event: SessionStateEvent): void {
    // Saída pendente chega antes da mudança de estado.
    this.flushOne(event.sessionId);
    this.events.state(event);
  }

  /** Agrupa saída por sessão: envia a cada 8 ms ou ao passar de 64 KiB. */
  pushData(sessionId: string, chunk: string): void {
    const parts = this.pending.get(sessionId) ?? [];
    parts.push(chunk);
    this.pending.set(sessionId, parts);
    const size = (this.pendingSize.get(sessionId) ?? 0) + chunk.length;
    this.pendingSize.set(sessionId, size);
    if (size >= FLUSH_BYTES) {
      this.flushOne(sessionId);
      return;
    }
    this.timer ??= setTimeout(() => {
      this.timer = null;
      this.flushAll();
    }, FLUSH_MS);
  }

  flushAll(): void {
    for (const id of [...this.pending.keys()]) this.flushOne(id);
  }

  closeAll(): void {
    for (const s of this.all()) s.close();
    this.sessions.clear();
  }

  private flushOne(id: string): void {
    const parts = this.pending.get(id);
    if (!parts || parts.length === 0) return;
    this.pending.delete(id);
    this.pendingSize.delete(id);
    this.events.data(id, parts.join(''));
  }
}

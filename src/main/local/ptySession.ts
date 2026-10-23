// Aba de terminal local (US4): PowerShell ou Prompt de Comando via ConPTY.
import { homedir } from 'node:os';
import { spawn, type IPty } from 'node-pty';
import type { LocalShell, SessionState, TermSize } from '@shared/model/types';
import type { SessionHandle, SessionRegistry } from '../sessions/registry';
import { resolveShell } from './shells';

export class LocalPtySession implements SessionHandle {
  readonly kind = 'local' as const;
  private pty: IPty | null = null;
  private state: SessionState = 'running';

  constructor(
    readonly id: string,
    private readonly shell: LocalShell,
    private readonly size: TermSize,
    private readonly registry: SessionRegistry,
  ) {}

  isActive(): boolean {
    return this.state === 'running';
  }

  start(): void {
    const pty = spawn(resolveShell(this.shell), [], {
      name: 'xterm-256color',
      cols: this.size.cols,
      rows: this.size.rows,
      cwd: homedir(),
      env: process.env,
      useConpty: true,
    });
    this.pty = pty;
    this.emit('running', null);
    pty.onData((data) => {
      this.registry.pushData(this.id, data);
    });
    pty.onExit(({ exitCode }) => {
      this.pty = null;
      this.emit('exited', exitCode);
    });
  }

  write(data: string): void {
    this.pty?.write(data);
  }

  resize(size: TermSize): void {
    this.pty?.resize(size.cols, size.rows);
  }

  close(): void {
    const pty = this.pty;
    this.pty = null;
    this.state = 'exited';
    pty?.kill();
  }

  private emit(state: SessionState, exitCode: number | null): void {
    this.state = state;
    this.registry.emitState({ sessionId: this.id, state, reason: null, exitCode });
  }
}

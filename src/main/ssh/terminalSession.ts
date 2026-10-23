// Aba de terminal SSH: conexão, shell interativo e reconexão (US2).
import { StringDecoder } from 'node:string_decoder';
import type { Client, ClientChannel } from 'ssh2';
import type { SessionState, TermSize } from '@shared/model/types';
import { MESSAGES, toAppError } from '../ipc/messages';
import type { SessionHandle, SessionRegistry } from '../sessions/registry';
import type { VaultStore } from '../vault/store';
import { openConnection } from './connection';
import type { Interactions } from './interactions';
import { planConnection, vaultKnownHosts } from './vaultAccess';

export interface SshSessionDeps {
  registry: SessionRegistry;
  vault: VaultStore;
  interactions: Interactions;
}

export class SshTerminalSession implements SessionHandle {
  readonly kind = 'ssh' as const;
  private client: Client | null = null;
  private stream: ClientChannel | null = null;
  private state: SessionState = 'connecting';
  private closed = false;
  private attempt = 0;

  constructor(
    readonly id: string,
    private readonly hostId: string,
    private size: TermSize,
    private readonly deps: SshSessionDeps,
  ) {}

  isActive(): boolean {
    return this.state !== 'disconnected';
  }

  async start(): Promise<void> {
    const attempt = ++this.attempt;
    const current = () => attempt === this.attempt && !this.closed;
    this.setState('connecting');
    try {
      // Credenciais lidas agora e descartadas após a conexão (não ficam na sessão).
      const plan = planConnection(this.deps.vault, this.hostId);
      const client = await openConnection({
        target: plan.target,
        auth: plan.auth,
        timeoutSeconds: plan.timeoutSeconds,
        knownHosts: vaultKnownHosts(this.deps.vault),
        callbacks: {
          onState: (phase) => {
            if (current()) this.setState(phase);
          },
          onHostKey: (info) => this.deps.interactions.askHostKey(this.id, info),
          onPrompt: (prompt) => this.deps.interactions.askPrompt(this.id, prompt),
        },
      });
      if (!current()) {
        client.end();
        return;
      }
      this.client = client;
      this.stream = await this.openShell(client);
      this.setState('connected');
    } catch (e) {
      if (current()) this.setState('disconnected', toAppError(e).message);
    }
  }

  private openShell(client: Client): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      client.shell({ term: 'xterm-256color', ...this.size }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        const decoder = new StringDecoder('utf8');
        stream.on('data', (chunk: Buffer) => {
          this.deps.registry.pushData(this.id, decoder.write(chunk));
        });
        stream.stderr.on('data', (chunk: Buffer) => {
          this.deps.registry.pushData(this.id, chunk.toString('utf8'));
        });
        stream.once('close', () => {
          client.end();
        });
        client.once('close', () => {
          if (this.client !== client || this.closed) return;
          this.client = null;
          this.stream = null;
          this.setState('disconnected', MESSAGES.SESSION_CLOSED);
        });
        client.on('error', (e) => {
          if (this.client === client && !this.closed) {
            this.setState('disconnected', toAppError(e).message);
          }
        });
        resolve(stream);
      });
    });
  }

  write(data: string): void {
    this.stream?.write(data);
  }

  resize(size: TermSize): void {
    this.size = size;
    this.stream?.setWindow(size.rows, size.cols, 0, 0);
  }

  async reconnect(): Promise<void> {
    if (this.state === 'connected') return;
    this.client?.end();
    await this.start();
  }

  close(): void {
    this.closed = true;
    this.deps.interactions.cancel(this.id);
    this.stream?.close();
    this.client?.end();
    this.client = null;
    this.stream = null;
  }

  private setState(state: SessionState, reason: string | null = null): void {
    this.state = state;
    this.deps.registry.emitState({ sessionId: this.id, state, reason, exitCode: null });
  }
}

// Aba SFTP (US5): conexão própria com o mesmo fluxo de host key/prompts do terminal.
import type { Client, SFTPWrapper } from 'ssh2';
import type { SessionState } from '@shared/model/types';
import { fail, MESSAGES, toAppError } from '../ipc/messages';
import type { SessionHandle, SessionRegistry } from '../sessions/registry';
import { openConnection } from '../ssh/connection';
import type { Interactions } from '../ssh/interactions';
import { planConnection, vaultKnownHosts } from '../ssh/vaultAccess';
import type { VaultStore } from '../vault/store';
import { realPath } from './browser';
import type { SftpEndpoint, TransferManager } from './transfers';

export interface SftpSessionDeps {
  registry: SessionRegistry;
  vault: VaultStore;
  interactions: Interactions;
  transfers: TransferManager;
}

function openChannel(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

export class SftpSession implements SessionHandle, SftpEndpoint {
  readonly kind = 'sftp' as const;
  private client: Client | null = null;
  private browser: SFTPWrapper | null = null;
  private state: SessionState = 'connecting';
  private closed = false;

  constructor(
    readonly id: string,
    private readonly hostId: string,
    private readonly deps: SftpSessionDeps,
  ) {}

  get sessionId(): string {
    return this.id;
  }

  /** Canal do navegador; falha se a conexão caiu. */
  get browse(): SFTPWrapper {
    if (!this.browser) throw fail('SESSION_CLOSED');
    return this.browser;
  }

  isActive(): boolean {
    return this.state === 'connected';
  }

  /** Conecta e devolve a pasta inicial (home do usuário). */
  async connect(): Promise<string> {
    this.setState('connecting');
    try {
      const plan = planConnection(this.deps.vault, this.hostId);
      const client = await openConnection({
        target: plan.target,
        auth: plan.auth,
        timeoutSeconds: plan.timeoutSeconds,
        knownHosts: vaultKnownHosts(this.deps.vault),
        callbacks: {
          onState: (phase) => {
            this.setState(phase);
          },
          onHostKey: (info) => this.deps.interactions.askHostKey(this.id, info),
          onPrompt: (prompt) => this.deps.interactions.askPrompt(this.id, prompt),
        },
      });
      if (this.closed) {
        client.end();
        throw fail('SESSION_CLOSED');
      }
      const browser = await openChannel(client);
      this.client = client;
      this.browser = browser;
      client.once('close', () => {
        if (this.client !== client) return;
        this.client = null;
        this.browser = null;
        this.deps.transfers.cancelSession(this.id);
        if (!this.closed) this.setState('disconnected', MESSAGES.SESSION_CLOSED);
      });
      client.on('error', () => undefined); // O 'close' seguinte trata a queda.
      const home = await realPath(browser, '.');
      this.setState('connected');
      return home;
    } catch (e) {
      if (!this.closed) this.setState('disconnected', toAppError(e).message);
      throw e;
    }
  }

  channel(): Promise<SFTPWrapper> {
    if (!this.client) return Promise.reject(fail('SESSION_CLOSED'));
    return openChannel(this.client);
  }

  async reconnect(): Promise<void> {
    if (this.state === 'connected') return;
    this.client?.end();
    // A falha já vira estado "desconectado" com o motivo; nada a propagar.
    await this.connect().catch(() => undefined);
  }

  write(): void {
    // Aba SFTP não recebe texto do terminal.
  }

  resize(): void {
    // Sem terminal.
  }

  close(): void {
    this.closed = true;
    this.deps.interactions.cancel(this.id);
    this.deps.transfers.cancelSession(this.id);
    this.client?.end();
    this.client = null;
    this.browser = null;
  }

  private setState(state: SessionState, reason: string | null = null): void {
    this.state = state;
    this.deps.registry.emitState({ sessionId: this.id, state, reason, exitCode: null });
  }
}

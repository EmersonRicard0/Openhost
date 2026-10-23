// Port forwarding local (FR-023–FR-026): uma conexão SSH por host, um servidor TCP por regra.
import { createServer, type Server, type Socket } from 'node:net';
import type { Client } from 'ssh2';
import type { ErrorCode } from '@shared/ipc/errors';
import type { ActiveForward, ForwardRule, ForwardRuleStatus } from '@shared/model/types';
import { AppFailure, fail, toAppError } from '../ipc/messages';

export interface ForwardingDeps {
  /** Regra atual, lida do cofre na ativação. */
  rule(ruleId: string): ForwardRule;
  /** Rótulo do host, guardado na ativação (a lista ativa é visível com o cofre bloqueado). */
  hostLabel(hostId: string): string;
  /** Abre a conexão SSH do host pelo fluxo normal (host key, credenciais, prompts). */
  connect(hostId: string): Promise<Client>;
  status(event: { ruleId: string } & ForwardRuleStatus): void;
}

interface HostLink {
  client: Promise<Client>;
  rules: Set<string>;
}

interface Runtime {
  rule: ForwardRule;
  hostLabel: string;
  status: ForwardRuleStatus;
  server: Server | null;
  sockets: Set<Socket>;
}

const INACTIVE: ForwardRuleStatus = { status: 'inactive', reason: null };

export class ForwardingManager {
  private readonly hosts = new Map<string, HostLink>();
  private readonly runtimes = new Map<string, Runtime>();

  constructor(private readonly deps: ForwardingDeps) {}

  status(ruleId: string): ForwardRuleStatus {
    return { ...(this.runtimes.get(ruleId)?.status ?? INACTIVE) };
  }

  /** Regras em andamento, ativas ou com erro — sem nenhum segredo. */
  listActive(): ActiveForward[] {
    return [...this.runtimes.values()]
      .filter((r) => r.status.status !== 'inactive')
      .map((r) => ({
        ruleId: r.rule.id,
        hostLabel: r.hostLabel,
        bindAddress: r.rule.bindAddress,
        bindPort: r.rule.bindPort,
        destHost: r.rule.destHost,
        destPort: r.rule.destPort,
        ...r.status,
      }));
  }

  activeCount(): number {
    let n = 0;
    for (const r of this.runtimes.values()) if (r.status.status === 'active') n++;
    return n;
  }

  async activate(ruleId: string): Promise<void> {
    const current = this.runtimes.get(ruleId);
    if (current && (current.status.status === 'active' || current.status.status === 'starting')) {
      return;
    }
    const rule = this.deps.rule(ruleId);
    const runtime: Runtime = {
      rule,
      hostLabel: this.deps.hostLabel(rule.hostId),
      status: INACTIVE,
      server: null,
      sockets: new Set(),
    };
    this.runtimes.set(ruleId, runtime);
    this.setStatus(runtime, 'starting', null);
    try {
      const client = await this.link(rule.hostId, ruleId);
      if (this.runtimes.get(ruleId) !== runtime) throw fail('CANCELLED');
      runtime.server = await this.listen(runtime, client);
      if (this.runtimes.get(ruleId) !== runtime) {
        runtime.server.close();
        throw fail('CANCELLED');
      }
      this.setStatus(runtime, 'active', null);
    } catch (e) {
      const code = toAppError(e).code;
      if (this.runtimes.get(ruleId) === runtime) {
        this.release(runtime);
        this.setStatus(runtime, 'error', code);
      }
      throw e instanceof AppFailure ? e : fail(code);
    }
  }

  deactivate(ruleId: string): void {
    const runtime = this.runtimes.get(ruleId);
    if (!runtime) return;
    this.runtimes.delete(ruleId);
    this.release(runtime);
    this.setStatus(runtime, 'inactive', null);
  }

  closeAll(): void {
    for (const id of [...this.runtimes.keys()]) this.deactivate(id);
  }

  /** Conexão compartilhada do host, aberta na primeira regra ativada. */
  private link(hostId: string, ruleId: string): Promise<Client> {
    let link = this.hosts.get(hostId);
    if (!link) {
      const client = this.deps.connect(hostId).then((c) => {
        c.once('close', () => {
          this.dropHost(hostId, link);
        });
        c.on('error', () => undefined); // O 'close' seguinte trata a queda.
        return c;
      });
      link = { client, rules: new Set() };
      this.hosts.set(hostId, link);
      const created = link;
      client.catch(() => {
        if (this.hosts.get(hostId) === created) this.hosts.delete(hostId);
      });
    }
    link.rules.add(ruleId);
    return link.client;
  }

  /** Conexão caiu: servidores fechados, portas liberadas, regras inativas (FR-026). */
  private dropHost(hostId: string, link: HostLink | undefined): void {
    if (!link || this.hosts.get(hostId) !== link) return;
    this.hosts.delete(hostId);
    for (const ruleId of link.rules) {
      const runtime = this.runtimes.get(ruleId);
      if (!runtime) continue;
      this.runtimes.delete(ruleId);
      this.closeServer(runtime);
      this.setStatus(runtime, 'inactive', 'SESSION_CLOSED');
    }
  }

  private listen(runtime: Runtime, client: Client): Promise<Server> {
    const { rule } = runtime;
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        runtime.sockets.add(socket);
        socket.once('close', () => runtime.sockets.delete(socket));
        socket.on('error', () => socket.destroy());
        client.forwardOut(
          socket.remoteAddress ?? '127.0.0.1',
          socket.remotePort ?? 0,
          rule.destHost,
          rule.destPort,
          (err, stream) => {
            if (err) {
              socket.destroy();
              return;
            }
            stream.on('error', () => socket.destroy());
            stream.once('close', () => socket.destroy());
            socket.once('close', () => stream.destroy());
            socket.pipe(stream).pipe(socket);
          },
        );
      });
      server.once('error', reject);
      server.listen({ host: rule.bindAddress, port: rule.bindPort, exclusive: true }, () => {
        server.off('error', reject);
        server.on('error', () => undefined);
        resolve(server);
      });
    });
  }

  private closeServer(runtime: Runtime): void {
    runtime.server?.close();
    runtime.server = null;
    for (const socket of runtime.sockets) socket.destroy();
    runtime.sockets.clear();
  }

  /** Fecha o servidor da regra e a conexão do host se era a última regra. */
  private release(runtime: Runtime): void {
    this.closeServer(runtime);
    const hostId = runtime.rule.hostId;
    const link = this.hosts.get(hostId);
    if (!link) return;
    link.rules.delete(runtime.rule.id);
    if (link.rules.size > 0) return;
    this.hosts.delete(hostId);
    void link.client.then(
      (c) => c.end(),
      () => undefined,
    );
  }

  private setStatus(
    runtime: Runtime,
    status: ForwardRuleStatus['status'],
    reason: ErrorCode | null,
  ) {
    runtime.status = { status, reason };
    this.deps.status({ ruleId: runtime.rule.id, status, reason });
  }
}

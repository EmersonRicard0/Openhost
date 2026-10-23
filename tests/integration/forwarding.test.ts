import { createConnection, createServer, type Server } from 'node:net';
import type { Client } from 'ssh2';
import { afterEach, describe, expect, it } from 'vitest';
import type { ForwardRule, ForwardRuleStatus } from '../../src/shared/model/types';
import { ForwardingManager } from '../../src/main/forwarding/manager';
import { start, stop } from '../../scripts/sshd.mjs';
import { connect } from './helpers';

type StatusEvent = { ruleId: string } & ForwardRuleStatus;

function rule(id: string, bindPort: number, destHost = 'echo', destPort = 7000): ForwardRule {
  return {
    id,
    hostId: 'host-1',
    label: null,
    bindAddress: '127.0.0.1',
    allowNonLoopback: false,
    bindPort,
    destHost,
    destPort,
  };
}

function harness(rules: ForwardRule[]) {
  const events: StatusEvent[] = [];
  let connections = 0;
  const manager = new ForwardingManager({
    rule: (id) => {
      const found = rules.find((r) => r.id === id);
      if (!found) throw new Error('regra inexistente');
      return found;
    },
    hostLabel: () => 'Teste',
    connect: (): Promise<Client> => {
      connections++;
      return connect('pwuser', { kind: 'password', password: 'pw-test-123' });
    },
    status: (e) => events.push(e),
  });
  return { manager, events, connections: () => connections };
}

/** Envia texto pela porta local e espera o eco. */
function echo(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => {
      socket.write(text);
    });
    let got = '';
    socket.on('data', (d: Buffer) => {
      got += d.toString('utf8');
      if (got.length >= text.length) {
        socket.end();
        resolve(got);
      }
    });
    socket.on('error', reject);
    socket.setTimeout(10_000, () => {
      socket.destroy();
      reject(new Error('sem eco'));
    });
  });
}

function listen(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

async function until(check: () => boolean, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('tempo esgotado');
    await new Promise((r) => setTimeout(r, 50));
  }
}

let cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

describe('port forwarding local', () => {
  it('ativa, troca bytes por eco e compartilha a conexão do host', async () => {
    const { manager, events, connections } = harness([rule('r1', 17000), rule('r2', 17001)]);
    cleanup.push(() => {
      manager.closeAll();
    });

    await manager.activate('r1');
    expect(events.map((e) => e.status)).toEqual(['starting', 'active']);
    expect(await echo(17000, 'olá, eco!')).toBe('olá, eco!');

    await manager.activate('r2');
    expect(await echo(17001, 'segunda')).toBe('segunda');
    expect(connections()).toBe(1);
    expect(
      manager
        .listActive()
        .map((a) => a.ruleId)
        .sort(),
    ).toEqual(['r1', 'r2']);

    // Desativar libera a porta.
    manager.deactivate('r1');
    expect(manager.status('r1')).toEqual({ status: 'inactive', reason: null });
    await close(await listen(17000));
    expect(await echo(17001, 'ainda ativa')).toBe('ainda ativa');
  });

  it('porta ocupada → erro PORT_IN_USE e regra não fica ativa (US6-3)', async () => {
    const busy = await listen(17002);
    cleanup.push(() => close(busy));
    const { manager, events } = harness([rule('r3', 17002)]);
    cleanup.push(() => {
      manager.closeAll();
    });

    await expect(manager.activate('r3')).rejects.toMatchObject({ code: 'PORT_IN_USE' });
    expect(manager.status('r3')).toEqual({ status: 'error', reason: 'PORT_IN_USE' });
    expect(events.at(-1)).toMatchObject({ ruleId: 'r3', status: 'error' });
    expect(manager.listActive()).toEqual([
      expect.objectContaining({ ruleId: 'r3', status: 'error' }),
    ]);
  });

  it(
    'queda da conexão desativa a regra e libera a porta (FR-026)',
    { timeout: 120_000 },
    async () => {
      const { manager, events } = harness([rule('r4', 17003)]);
      cleanup.push(() => {
        manager.closeAll();
      });
      await manager.activate('r4');
      expect(await echo(17003, 'antes')).toBe('antes');

      stop();
      cleanup.push(() => start());
      await until(() => manager.status('r4').status === 'inactive', 60_000);
      expect(events.at(-1)).toMatchObject({ ruleId: 'r4', status: 'inactive' });
      await close(await listen(17003));
    },
  );
});

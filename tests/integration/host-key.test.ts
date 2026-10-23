import { afterAll, describe, expect, it } from 'vitest';
import { restoreKey, rotateKey } from '../../scripts/sshd.mjs';
import type { HostKeyPromptInfo } from '../../src/main/ssh/connection';
import { codeOf, connect, memoryKnownHosts } from './helpers';

const auth = { kind: 'password', password: 'pw-test-123' } as const;

describe('SSH: verificação de host key (FR-013, SC-005)', () => {
  const known = memoryKnownHosts();

  afterAll(async () => {
    await restoreKey();
  });

  it('primeira conexão pede confirmação antes de autenticar', async () => {
    const states: string[] = [];
    const seen: HostKeyPromptInfo[] = [];
    const client = await connect('pwuser', auth, {
      known,
      callbacks: {
        onState: (s) => states.push(s),
        onHostKey: (info) => {
          seen.push(info);
          // Nada de autenticação antes da resposta.
          expect(states).not.toContain('authenticating');
          return Promise.resolve(true);
        },
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'new', keyType: 'ssh-ed25519' });
    expect(seen[0]?.fingerprint).toMatch(/^SHA256:/);
    expect(states.indexOf('awaitingHostKey')).toBeLessThan(states.indexOf('authenticating'));
    expect(known.content.knownHostKeys).toHaveLength(1);
    client.end();
  });

  it('chave conhecida não pergunta de novo', async () => {
    let asked = false;
    const client = await connect('pwuser', auth, {
      known,
      callbacks: {
        onHostKey: () => {
          asked = true;
          return Promise.resolve(true);
        },
      },
    });
    expect(asked).toBe(false);
    client.end();
  });

  it('recusar a chave → HOST_KEY_REJECTED', async () => {
    const fresh = memoryKnownHosts();
    const code = await codeOf(
      connect('pwuser', auth, {
        known: fresh,
        callbacks: { onHostKey: () => Promise.resolve(false) },
      }),
    );
    expect(code).toBe('HOST_KEY_REJECTED');
    expect(fresh.content.knownHostKeys).toHaveLength(0);
  });

  it('chave trocada bloqueia até aceite explícito', async () => {
    const before = known.content.knownHostKeys[0]?.fingerprint;
    await rotateKey();

    const states: string[] = [];
    let info: HostKeyPromptInfo | null = null;
    const code = await codeOf(
      connect('pwuser', auth, {
        known,
        callbacks: {
          onState: (s) => states.push(s),
          onHostKey: (i) => {
            info = i;
            return Promise.resolve(false);
          },
        },
      }),
    );
    expect(code).toBe('HOST_KEY_REJECTED');
    expect(info).toMatchObject({ kind: 'changed', previousFingerprint: before });
    expect(states).not.toContain('authenticating');
    expect(known.content.knownHostKeys[0]?.fingerprint).toBe(before);

    const client = await connect('pwuser', auth, {
      known,
      callbacks: { onHostKey: () => Promise.resolve(true) },
    });
    expect(known.content.knownHostKeys[0]?.fingerprint).not.toBe(before);
    client.end();
  });
});

import { describe, expect, it } from 'vitest';
import { codeOf, connect, keyPassphrase, readKey, shellRun } from './helpers';

describe('SSH: conexão e autenticação', () => {
  it('pwuser por senha', async () => {
    const client = await connect('pwuser', { kind: 'password', password: 'pw-test-123' });
    const out = await shellRun(client, 'whoami');
    expect(out).toContain('pwuser');
    client.end();
  });

  it.each([
    ['ed25519', null],
    ['ed25519-passphrase', 'PASS'],
    ['ecdsa-p256', null],
    ['rsa-pem', null],
  ])('keyuser por chave %s', async (file, passphrase) => {
    const client = await connect('keyuser', {
      kind: 'key',
      privateKey: readKey(file),
      passphrase: passphrase === 'PASS' ? keyPassphrase() : null,
    });
    expect(await shellRun(client, 'whoami')).toContain('keyuser');
    client.end();
  });

  it('kbuser responde o prompt keyboard-interactive', async () => {
    const prompts: string[] = [];
    const client = await connect(
      'kbuser',
      { kind: 'ask' },
      {
        callbacks: {
          onPrompt: (p) => {
            prompts.push(...p.prompts.map((q) => q.text));
            return Promise.resolve(p.prompts.map(() => 'kb-test-123'));
          },
        },
      },
    );
    expect(prompts.some((p) => /password/i.test(p))).toBe(true);
    expect(await shellRun(client, 'whoami')).toContain('kbuser');
    client.end();
  });

  it('senha errada → AUTH_FAILED', async () => {
    expect(await codeOf(connect('pwuser', { kind: 'password', password: 'errada' }))).toBe(
      'AUTH_FAILED',
    );
  });

  it('cancelar o prompt → AUTH_FAILED', async () => {
    expect(await codeOf(connect('kbuser', { kind: 'ask' }))).toBe('AUTH_FAILED');
  });

  it('porta fechada → CONNECT_REFUSED', async () => {
    expect(await codeOf(connect('pwuser', { kind: 'password', password: 'x' }, { port: 1 }))).toBe(
      'CONNECT_REFUSED',
    );
  });

  it('endereço sem resposta → CONNECT_TIMEOUT no tempo limite', async () => {
    const start = Date.now();
    const code = await codeOf(
      connect(
        'pwuser',
        { kind: 'password', password: 'x' },
        { address: '10.255.255.1', timeoutSeconds: 2 },
      ),
    );
    expect(['CONNECT_TIMEOUT', 'HOST_UNREACHABLE']).toContain(code);
    expect(Date.now() - start).toBeLessThan(6000);
  });

  it('TERM é xterm-256color e o tamanho da janela é aplicado', async () => {
    const client = await connect('pwuser', { kind: 'password', password: 'pw-test-123' });
    const out = await shellRun(client, 'echo "T=$TERM"; stty size', { cols: 132, rows: 40 });
    expect(out).toContain('T=xterm-256color');
    expect(out).toContain('40 132');
    client.end();
  });

  it('conexão fica pronta em menos de 3 s (SC-002)', async () => {
    const start = Date.now();
    const client = await connect('pwuser', { kind: 'password', password: 'pw-test-123' });
    expect(Date.now() - start).toBeLessThan(3000);
    client.end();
  });
});

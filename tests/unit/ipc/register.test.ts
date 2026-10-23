import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createRegistrar, type IpcLike } from '../../../src/main/ipc/register';
import { fail } from '../../../src/main/ipc/messages';

type Listener = (event: unknown, ...args: unknown[]) => unknown;

function fakeIpc() {
  const listeners = new Map<string, Listener>();
  const ipc: IpcLike = { handle: (channel, fn) => listeners.set(channel, fn as Listener) };
  const call = (channel: string, event: unknown, ...args: unknown[]) => {
    const fn = listeners.get(channel);
    if (!fn) throw new Error(`sem handler ${channel}`);
    return fn(event, ...args);
  };
  return { ipc, call };
}

const trusted = { senderFrame: 'main' };
const untrusted = { senderFrame: 'iframe' };

describe('createRegistrar', () => {
  let unlocked: boolean;
  let ipc: ReturnType<typeof fakeIpc>;
  let reg: ReturnType<typeof createRegistrar>;

  beforeEach(() => {
    unlocked = true;
    ipc = fakeIpc();
    reg = createRegistrar({
      ipc: ipc.ipc,
      isTrustedSender: (e) => (e as typeof trusted).senderFrame === 'main',
      isUnlocked: () => unlocked,
    });
  });

  it('valida a entrada e devolve ok', async () => {
    reg.handle('vault', 'unlock', z.tuple([z.string().min(1)]), (pw) => {
      expect(pw).toBe('x');
    });
    await expect(ipc.call('vault:unlock', trusted, 'x')).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it('payload inválido → INVALID_INPUT sem chamar o handler', async () => {
    const fn = vi.fn();
    reg.handle('vault', 'unlock', z.tuple([z.string().min(1)]), fn);
    const res = await ipc.call('vault:unlock', trusted, 42);
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('argumentos extras são rejeitados', async () => {
    reg.handle('vault', 'lock', z.tuple([]), vi.fn());
    const res = await ipc.call('vault:lock', trusted, 'extra');
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('remetente não confiável é rejeitado sem chamar o handler', async () => {
    const fn = vi.fn();
    reg.handle('vault', 'lock', z.tuple([]), fn);
    const res = await ipc.call('vault:lock', untrusted);
    expect(res).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('handler 🔒 com cofre bloqueado → VAULT_LOCKED', async () => {
    unlocked = false;
    const fn = vi.fn();
    reg.handle('hosts', 'list', z.tuple([]), fn, { requiresUnlocked: true });
    const res = await ipc.call('hosts:list', trusted);
    expect(res).toMatchObject({ ok: false, error: { code: 'VAULT_LOCKED' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('AppFailure vira o código correspondente', async () => {
    reg.handle('vault', 'unlock', z.tuple([z.string()]), () => {
      throw fail('VAULT_BAD_PASSWORD');
    });
    const res = await ipc.call('vault:unlock', trusted, 'x');
    expect(res).toMatchObject({ ok: false, error: { code: 'VAULT_BAD_PASSWORD' } });
  });

  it('exceção qualquer → INTERNAL sem stack nem mensagem original', async () => {
    reg.handle('vault', 'unlock', z.tuple([z.string()]), () => {
      throw new Error('segredo-vazado');
    });
    const res = await ipc.call('vault:unlock', trusted, 'x');
    expect(res).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(JSON.stringify(res)).not.toContain('segredo-vazado');
  });

  it('não permite registrar o mesmo canal duas vezes', () => {
    reg.handle('vault', 'lock', z.tuple([]), vi.fn());
    expect(() => {
      reg.handle('vault', 'lock', z.tuple([]), vi.fn());
    }).toThrow();
  });
});

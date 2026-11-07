import { beforeEach, describe, expect, it, vi } from 'vitest';

type DataEv = { sessionId: string; data: string };
let emitData: (ev: DataEv) => void = () => undefined;
let emitClosed: (ev: { sessionId: string }) => void = () => undefined;

async function load() {
  vi.resetModules();
  (globalThis as unknown as { window: unknown }).window = {
    shellvault: {
      sessions: {
        onData: (cb: (ev: DataEv) => void) => {
          emitData = cb;
          return () => undefined;
        },
        onClosed: (cb: (ev: { sessionId: string }) => void) => {
          emitClosed = cb;
          return () => undefined;
        },
      },
    },
  };
  const bus = await import('./dataBus');
  bus.subscribeData();
  return bus;
}

describe('dataBus: backlog com teto e sessão fechada (014, R3)', () => {
  beforeEach(() => {
    emitData = () => undefined;
    emitClosed = () => undefined;
  });

  it('guarda o que chega antes de montar e entrega na ordem', async () => {
    const bus = await load();
    emitData({ sessionId: 's', data: 'a' });
    emitData({ sessionId: 's', data: 'b' });
    const got: string[] = [];
    bus.attach('s', (d) => got.push(d));
    expect(got).toEqual(['a', 'b']);
  });

  it('teto de 1 MiB por sessão: descarta os lotes mais antigos', async () => {
    const bus = await load();
    const chunk = 'x'.repeat(256 * 1024);
    for (let i = 0; i < 6; i++) emitData({ sessionId: 's', data: `${String(i)}${chunk}` });
    const got: string[] = [];
    bus.attach('s', (d) => got.push(d));
    const total = got.reduce((n, d) => n + d.length, 0);
    expect(total).toBeLessThanOrEqual(1024 * 1024 + 16);
    expect(got[got.length - 1]?.startsWith('5')).toBe(true);
    expect(got[0]?.startsWith('0')).toBe(false);
  });

  it('sessão fechada descarta o backlog e ignora lotes novos', async () => {
    const bus = await load();
    emitData({ sessionId: 's', data: 'antes' });
    emitClosed({ sessionId: 's' });
    emitData({ sessionId: 's', data: 'depois' });
    const got: string[] = [];
    bus.attach('s', (d) => got.push(d));
    expect(got).toEqual([]);
  });

  it('desmontar e receber depois não acumula para sessão fechada pelo app', async () => {
    const bus = await load();
    const detach = bus.attach('s', () => undefined);
    detach();
    bus.forget('s');
    emitData({ sessionId: 's', data: 'tarde' });
    const got: string[] = [];
    bus.attach('s', (d) => got.push(d));
    expect(got).toEqual([]);
  });
});

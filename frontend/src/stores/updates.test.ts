import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateInfo, UpdateStateEvent } from '@shared/model/types';
import { checkNow, hasUpdate, loadUpdates, remindLater, skipVersion, useUpdates } from './updates';

const base: UpdateInfo = {
  current: '0.5.0',
  latest: null,
  prerelease: false,
  notes: '',
  install: 'nsis',
  oneClick: true,
  manualCommand: null,
  checkedAt: '2026-10-26T12:00:00Z',
  notify: false,
  state: 'upToDate',
  progress: null,
  reason: null,
};

const available: UpdateInfo = {
  ...base,
  latest: '0.5.1',
  notes: '## Novidades',
  notify: true,
  state: 'available',
};

let info: UpdateInfo = base;
let emit: (event: UpdateStateEvent) => void = () => undefined;
const api = {
  info: vi.fn(() => Promise.resolve({ ok: true, value: info })),
  check: vi.fn(() => Promise.resolve({ ok: true, value: info })),
  prefs: vi.fn(() => Promise.resolve({ ok: true, value: { auto: true, prerelease: false } })),
  lastResult: vi.fn(() => Promise.resolve({ ok: true, value: null })),
  remind: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  skip: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
  onState: vi.fn((handler: (event: UpdateStateEvent) => void) => {
    emit = handler;
    return () => undefined;
  }),
};
Object.assign(globalThis, { window: { shellvault: { updates: api } } });

describe('atualização pelo app no store (specs/007)', () => {
  beforeEach(() => {
    info = base;
    useUpdates.setState({ info: null, prefs: null, open: false, lastResult: null });
    vi.clearAllMocks();
  });

  it('sem versão nova não abre aviso nem indicador', async () => {
    await loadUpdates();
    expect(useUpdates.getState().open).toBe(false);
    expect(hasUpdate(useUpdates.getState().info)).toBe(false);
  });

  it('versão nova não dispensada abre o aviso uma vez', async () => {
    info = available;
    await loadUpdates();
    expect(useUpdates.getState().open).toBe(true);
    useUpdates.getState().setOpen(false);
    emit({ state: 'available', version: '0.5.1' });
    await Promise.resolve();
    await Promise.resolve();
    // Mesma versão: o aviso fechado continua fechado, o indicador fica.
    expect(useUpdates.getState().open).toBe(false);
    expect(hasUpdate(useUpdates.getState().info)).toBe(true);
  });

  it('versão pulada ou adiada pelo Go (notify falso) não abre o aviso', async () => {
    info = { ...available, notify: false };
    await loadUpdates();
    expect(useUpdates.getState().open).toBe(false);
    expect(hasUpdate(useUpdates.getState().info)).toBe(true);
  });

  it('progresso do download chega pelo evento', async () => {
    info = available;
    await loadUpdates();
    emit({ state: 'downloading', progress: { received: 50, total: 100 } });
    expect(useUpdates.getState().info?.progress).toEqual({ received: 50, total: 100 });
    emit({ state: 'failed', reason: 'signature' });
    expect(useUpdates.getState().info).toMatchObject({ state: 'failed', reason: 'signature' });
  });

  it('lembrar depois e pular fecham o aviso e avisam o Go', async () => {
    info = available;
    await loadUpdates();
    await remindLater();
    expect(api.remind).toHaveBeenCalled();
    expect(useUpdates.getState().open).toBe(false);
    useUpdates.getState().setOpen(true);
    await skipVersion();
    expect(api.skip).toHaveBeenCalledWith('0.5.1');
    expect(useUpdates.getState().open).toBe(false);
  });

  it('procurar manualmente devolve o erro para a interface', async () => {
    api.check.mockResolvedValueOnce({
      ok: false,
      error: { code: 'NETWORK', message: 'sem rede' },
    } as never);
    expect(await checkNow()).toMatchObject({ code: 'NETWORK' });
    info = available;
    expect(await checkNow()).toBeNull();
    expect(useUpdates.getState().open).toBe(true);
  });
});

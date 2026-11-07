import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConflictView, SyncInfo } from '@shared/model/types';
import { connectDrive, loadSync, resolveConflict, showsStatus, startSync, useSync } from './sync';

const off: SyncInfo = {
  state: 'off',
  available: true,
  email: null,
  deviceName: null,
  lastSync: null,
  pending: 0,
  conflicts: 0,
  reason: null,
};

const conflict: ConflictView = {
  key: 'host:1',
  kind: 'host',
  label: 'web-01',
  local: { deleted: false, summary: [{ field: 'Endereço', value: '10.0.0.1' }] },
  remote: { deleted: true, summary: [] },
};

let info: SyncInfo = off;
let emit: (info: SyncInfo) => void = () => undefined;
const api = {
  info: vi.fn(() => Promise.resolve({ ok: true, value: info })),
  connect: vi.fn(() =>
    Promise.resolve({ ok: true, value: { email: 'a@b.c', cloudHasVault: false } }),
  ),
  start: vi.fn(() =>
    Promise.resolve({ ok: true, value: { ...off, state: 'synced', email: 'a@b.c' } }),
  ),
  conflicts: vi.fn(() => Promise.resolve({ ok: true, value: [conflict] })),
  resolve: vi.fn(() =>
    Promise.resolve({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Item não encontrado.' },
    }),
  ),
  onState: vi.fn((handler: (info: SyncInfo) => void) => {
    emit = handler;
    return () => undefined;
  }),
};
Object.assign(globalThis, { window: { shellvault: { sync: api } } });

describe('sincronização no store (specs/008)', () => {
  beforeEach(() => {
    info = off;
    useSync.setState({ info: null, conflicts: [], connecting: false });
    vi.clearAllMocks();
  });

  it('carrega o estado e assina o evento uma vez', async () => {
    await loadSync();
    await loadSync();
    expect(api.onState).toHaveBeenCalledTimes(1);
    expect(useSync.getState().info?.state).toBe('off');
  });

  it('a barra de status só mostra com conta ligada e build com sincronização', () => {
    expect(showsStatus(null)).toBe(false);
    expect(showsStatus(off)).toBe(false);
    expect(showsStatus({ ...off, state: 'synced' })).toBe(true);
    expect(showsStatus({ ...off, state: 'synced', available: false })).toBe(false);
  });

  it('marca a espera do navegador durante o login', async () => {
    const pending = connectDrive();
    expect(useSync.getState().connecting).toBe(true);
    const res = await pending;
    expect(res.ok).toBe(true);
    expect(useSync.getState().connecting).toBe(false);
  });

  it('iniciar aplica o estado devolvido', async () => {
    expect(await startSync('upload')).toBeNull();
    expect(api.start).toHaveBeenCalledWith('upload', '');
    expect(useSync.getState().info?.state).toBe('synced');
  });

  it('busca os conflitos quando a contagem muda pelo evento', async () => {
    await loadSync();
    emit({ ...off, state: 'conflict', conflicts: 1 });
    await vi.waitFor(() => {
      expect(useSync.getState().conflicts).toEqual([conflict]);
    });
    emit({ ...off, state: 'synced', conflicts: 0 });
    await vi.waitFor(() => {
      expect(useSync.getState().conflicts).toEqual([]);
    });
    expect(api.conflicts).toHaveBeenCalledTimes(1);
  });

  it('devolve o erro da ponte sem mudar o estado', async () => {
    useSync.setState({ info: { ...off, state: 'conflict', conflicts: 1 } });
    const err = await resolveConflict('host:1', 'local');
    expect(err?.code).toBe('NOT_FOUND');
    expect(useSync.getState().info?.state).toBe('conflict');
  });
});

// Sincronização pelo Google Drive (specs/008): estado vindo do Go e as ações da interface.
import { create } from 'zustand';
import type { AppError } from '@shared/ipc/errors';
import type {
  CloudVersion,
  ConflictView,
  SyncConnectResult,
  SyncInfo,
  SyncStartMode,
} from '@shared/model/types';

interface SyncState {
  info: SyncInfo | null;
  conflicts: ConflictView[];
  /** Esperando o login no navegador (FR-801). */
  connecting: boolean;
}

export const useSync = create<SyncState>(() => ({
  info: null,
  conflicts: [],
  connecting: false,
}));

type Outcome<T> = { ok: true; value: T } | { ok: false; error: AppError };

function setInfo(info: SyncInfo): void {
  const before = useSync.getState().info;
  useSync.setState({ info });
  // Conflitos novos ou resolvidos em outro lugar: relê a lista (FR-811).
  if (info.conflicts !== before?.conflicts) void refreshConflicts();
}

async function refreshConflicts(): Promise<void> {
  const info = useSync.getState().info;
  if (!info || info.conflicts === 0) {
    useSync.setState({ conflicts: [] });
    return;
  }
  const res = await window.shellvault.sync.conflicts();
  if (res.ok) useSync.setState({ conflicts: res.value });
}

/** Há algo a mostrar na barra de status: conta ligada ou erro de conexão. */
export function showsStatus(info: SyncInfo | null): boolean {
  return !!info?.available && info.state !== 'off';
}

let subscribed = false;

export async function loadSync(): Promise<void> {
  const api = window.shellvault.sync;
  if (!subscribed) {
    subscribed = true;
    api.onState(setInfo);
  }
  const res = await api.info();
  if (res.ok) setInfo(res.value);
}

/** Abre o navegador e espera o login; `SYNC_CANCELLED` volta como erro sem mudar nada. */
export async function connectDrive(): Promise<Outcome<SyncConnectResult>> {
  useSync.setState({ connecting: true });
  try {
    return await window.shellvault.sync.connect();
  } finally {
    useSync.setState({ connecting: false });
  }
}

export async function cancelConnect(): Promise<void> {
  await window.shellvault.sync.cancelConnect();
}

/** Resultado de uma ação que devolve `SyncInfo`: aplica o estado e devolve só o erro. */
async function applying(res: Promise<Outcome<SyncInfo>>): Promise<AppError | null> {
  const out = await res;
  if (!out.ok) return out.error;
  setInfo(out.value);
  return null;
}

export function startSync(mode: SyncStartMode, cloudPassword = ''): Promise<AppError | null> {
  return applying(window.shellvault.sync.start(mode, cloudPassword));
}

export function syncNow(): Promise<AppError | null> {
  return applying(window.shellvault.sync.syncNow());
}

export function resolveConflict(key: string, keep: 'local' | 'remote'): Promise<AppError | null> {
  return applying(window.shellvault.sync.resolve(key, keep));
}

export function restoreVersion(name: string): Promise<AppError | null> {
  return applying(window.shellvault.sync.restoreVersion(name));
}

export function providePassword(password: string): Promise<AppError | null> {
  return applying(window.shellvault.sync.providePassword(password));
}

export async function listVersions(): Promise<Outcome<CloudVersion[]>> {
  return window.shellvault.sync.versions();
}

export async function setDeviceName(name: string): Promise<AppError | null> {
  const res = await window.shellvault.sync.setDeviceName(name);
  if (!res.ok) return res.error;
  await loadSync();
  return null;
}

export async function disconnect(deleteCloud: boolean): Promise<AppError | null> {
  const res = await window.shellvault.sync.disconnect(deleteCloud);
  if (!res.ok) return res.error;
  await loadSync();
  return null;
}

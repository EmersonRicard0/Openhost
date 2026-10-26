// Atualização pelo próprio app (specs/007): estado vindo do Go e se o aviso está aberto.
import { create } from 'zustand';
import type { AppError } from '@shared/ipc/errors';
import type { UpdateInfo, UpdatePrefs, UpdateResult, UpdateStateEvent } from '@shared/model/types';

interface UpdatesState {
  info: UpdateInfo | null;
  prefs: UpdatePrefs | null;
  /** Aviso aberto; fechado continua acessível pelo indicador da barra de status (FR-708). */
  open: boolean;
  /** Resultado da última aplicação, mostrado uma vez no início seguinte (FR-713). */
  lastResult: UpdateResult | null;
  setOpen: (open: boolean) => void;
  apply: (event: UpdateStateEvent) => void;
  dismissResult: () => void;
}

export const useUpdates = create<UpdatesState>((set, get) => ({
  info: null,
  prefs: null,
  open: false,
  lastResult: null,
  setOpen(open) {
    set({ open });
  },
  apply(event) {
    const info = get().info;
    if (!info) return;
    set({
      info: {
        ...info,
        state: event.state,
        progress: event.progress ?? null,
        reason: event.reason ?? null,
      },
    });
  },
  dismissResult() {
    set({ lastResult: null });
  },
}));

/** Há versão nova em andamento ou pronta (indicador da barra de status). */
export function hasUpdate(info: UpdateInfo | null): boolean {
  if (!info?.latest) return false;
  return ['available', 'downloading', 'verifying', 'ready', 'failed'].includes(info.state);
}

async function refresh(): Promise<void> {
  const res = await window.shellvault.updates.info();
  if (!res.ok) return;
  const before = useUpdates.getState().info;
  // O aviso abre sozinho quando surge uma versão que o usuário não dispensou.
  const opens = res.value.notify && before?.latest !== res.value.latest;
  useUpdates.setState({ info: res.value, ...(opens ? { open: true } : {}) });
}

let subscribed = false;

/** Lê o estado inicial, as preferências e o resultado da última atualização; assina o evento. */
export async function loadUpdates(): Promise<void> {
  const api = window.shellvault.updates;
  if (!subscribed) {
    subscribed = true;
    api.onState((event) => {
      // Mudança de versão ou de disponibilidade traz notas e `notify` novos.
      if (event.state === 'available' || event.state === 'upToDate') void refresh();
      else useUpdates.getState().apply(event);
    });
  }
  const [prefs, last] = await Promise.all([api.prefs(), api.lastResult()]);
  useUpdates.setState({
    ...(prefs.ok ? { prefs: prefs.value } : {}),
    ...(last.ok ? { lastResult: last.value } : {}),
  });
  await refresh();
}

/** "Procurar atualizações": devolve o erro para a interface explicar (FR-704). */
export async function checkNow(): Promise<AppError | null> {
  const res = await window.shellvault.updates.check(true);
  if (!res.ok) return res.error;
  useUpdates.setState({ info: res.value, open: res.value.latest !== null });
  return null;
}

export async function remindLater(): Promise<void> {
  useUpdates.setState({ open: false });
  await window.shellvault.updates.remind();
}

export async function skipVersion(): Promise<void> {
  const version = useUpdates.getState().info?.latest;
  useUpdates.setState({ open: false });
  if (version) await window.shellvault.updates.skip(version);
}

export async function savePrefs(patch: Partial<UpdatePrefs>): Promise<AppError | null> {
  const current = useUpdates.getState().prefs ?? { auto: true, prerelease: false };
  const res = await window.shellvault.updates.setPrefs({ ...current, ...patch });
  if (!res.ok) return res.error;
  useUpdates.setState({ prefs: res.value });
  return null;
}

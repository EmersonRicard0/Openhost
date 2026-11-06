// Biblioteca de comandos (specs/012, US3–US5). Carrega ao abrir o cofre, recarrega no evento
// `snippets:changed` e esvazia ao bloquear, junto com os últimos valores dos campos (R10), que só
// existem em memória (FR-1217).
import { create } from 'zustand';
import type { Snippet, SnippetInput } from '@shared/model/types';
import type { Result } from '@shared/ipc/result';
import { toastError } from '../ui/Toast';
import { useVault } from './vault';

interface SnippetsState {
  snippets: Snippet[];
  loaded: boolean;
  /** snippetId → campo → último valor (só nesta abertura do cofre). */
  lastValues: Record<string, Record<string, string>>;
  reload: () => Promise<void>;
  clear: () => void;
  create: (input: SnippetInput) => Promise<Result<Snippet>>;
  update: (id: string, input: SnippetInput) => Promise<Result<Snippet>>;
  remove: (id: string) => Promise<Result<void>>;
  duplicate: (id: string) => Promise<Result<Snippet>>;
  remember: (id: string, values: Record<string, string>) => void;
}

const api = () => window.shellvault.snippets;

export const useSnippets = create<SnippetsState>((set, get) => ({
  snippets: [],
  loaded: false,
  lastValues: {},
  async reload() {
    const res = await api().list();
    if (!res.ok) {
      // Cofre bloqueado no meio do caminho não é erro para o usuário.
      if (res.error.code !== 'VAULT_LOCKED') toastError(res.error);
      return;
    }
    set({ snippets: res.value, loaded: true });
  },
  clear() {
    set({ snippets: [], loaded: false, lastValues: {} });
  },
  async create(input) {
    const res = await api().create(input);
    if (res.ok) await get().reload();
    return res;
  },
  async update(id, input) {
    const res = await api().update(id, input);
    if (res.ok) await get().reload();
    return res;
  },
  async remove(id) {
    const res = await api().remove(id);
    if (res.ok) {
      set({
        lastValues: Object.fromEntries(Object.entries(get().lastValues).filter(([k]) => k !== id)),
      });
      await get().reload();
    }
    return res;
  },
  async duplicate(id) {
    const res = await api().duplicate(id);
    if (res.ok) await get().reload();
    return res;
  },
  remember(id, values) {
    set({ lastValues: { ...get().lastValues, [id]: { ...values } } });
  },
}));

let subscribed = false;

/** Segue o estado do cofre: aberto carrega e escuta mudanças; qualquer outro esvazia. */
export function subscribeSnippets(): void {
  if (subscribed) return;
  subscribed = true;
  let off: (() => void) | null = null;
  const apply = (unlocked: boolean) => {
    if (unlocked && !off) {
      off = api().onChanged(() => void useSnippets.getState().reload());
      void useSnippets.getState().reload();
    } else if (!unlocked && off) {
      off();
      off = null;
      useSnippets.getState().clear();
    }
  };
  apply(useVault.getState().status?.state === 'unlocked');
  useVault.subscribe((v, prev) => {
    const now = v.status?.state === 'unlocked';
    if (now !== (prev.status?.state === 'unlocked')) apply(now);
  });
}

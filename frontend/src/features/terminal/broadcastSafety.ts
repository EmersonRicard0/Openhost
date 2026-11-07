// Host que passa a ser de Produção com "Digitar no grupo" ligado sai da transmissão e o usuário
// é avisado; só volta marcado à mão (specs/012, FR-1209).
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { useSessions } from '../../stores/sessions';
import { toastInfo } from '../../ui/Toast';
import { PRODUCTION_ENVIRONMENT } from './broadcast';
import { leaves } from './layout';

/** Ids de host que entraram em produção entre `prev` e `next`. */
export function newlyProduction(
  prev: readonly { id: string; environmentId?: string | null }[],
  next: readonly { id: string; environmentId?: string | null }[],
): Set<string> {
  const before = new Set(
    prev.filter((h) => h.environmentId === PRODUCTION_ENVIRONMENT).map((h) => h.id),
  );
  return new Set(
    next
      .filter((h) => h.environmentId === PRODUCTION_ENVIRONMENT && !before.has(h.id))
      .map((h) => h.id),
  );
}

let subscribed = false;

export function subscribeBroadcastSafety(): void {
  if (subscribed) return;
  subscribed = true;
  useHosts.subscribe((state, prev) => {
    if (state.hosts === prev.hosts) return;
    const entered = newlyProduction(prev.hosts, state.hosts);
    if (entered.size === 0) return;
    const sessions = useSessions.getState();
    for (const group of Object.values(sessions.groups)) {
      if (!group.broadcast) continue;
      for (const id of leaves(group.root)) {
        const tab = sessions.tabs.find((tb) => tb.id === id);
        if (!tab?.hostId || !entered.has(tab.hostId) || group.broadcast.excluded.includes(id))
          continue;
        sessions.setReceiving(group.id, id, false);
        toastInfo(t.terminal.broadcast.becameProduction(tab.baseTitle));
      }
    }
  });
}

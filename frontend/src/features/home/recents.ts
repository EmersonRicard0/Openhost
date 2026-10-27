// Recentes mostrados na tela inicial (specs/010, FR-1009). O Go guarda a lista e a ordem.
import type { HostView, QuickTarget, RecentEntry } from '@shared/model/types';
import { targetLabel } from './quickTarget';

export const MAX_VISIBLE_RECENTS = 8;

export type VisibleRecent =
  | { kind: 'host'; key: string; host: HostView }
  | { kind: 'quick'; key: string; target: QuickTarget; label: string };

/** Hosts excluídos somem; favoritos já aparecem no bloco deles. */
export function visibleRecents(
  recents: readonly RecentEntry[],
  hosts: readonly HostView[],
): VisibleRecent[] {
  const byId = new Map(hosts.map((h) => [h.id, h]));
  const out: VisibleRecent[] = [];
  for (const entry of recents) {
    if (out.length >= MAX_VISIBLE_RECENTS) break;
    if (entry.kind === 'host') {
      const host = byId.get(entry.hostId);
      if (host && !host.favorite) out.push({ kind: 'host', key: `h:${host.id}`, host });
    } else {
      const target = { address: entry.address, port: entry.port, username: entry.username };
      const label = targetLabel(target);
      out.push({ kind: 'quick', key: `q:${label}`, target, label });
    }
  }
  return out;
}

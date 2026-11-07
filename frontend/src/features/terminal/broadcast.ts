// "Digitar no grupo" (specs/012): para onde vai a entrada do painel ativo e quem é de produção.
import { groupOf, type Group, type Tab } from '../../stores/sessions';
import { leaves } from './layout';
import { send } from './writer';

/** Ambiente pronto da 009 que pede confirmação, mesmo renomeado (research R3). */
export const PRODUCTION_ENVIRONMENT = 'prod';

/** Membros do grupo − o ativo − os desmarcados − os que não estão conectados. */
export function broadcastTargets(
  tabs: readonly Tab[],
  groups: Record<string, Group>,
  activeId: string | null,
): string[] {
  if (!activeId) return [];
  const group = groupOf(groups, activeId);
  if (!group?.broadcast) return [];
  const { excluded } = group.broadcast;
  const connected = new Set(tabs.filter((t) => t.state === 'connected').map((t) => t.id));
  return leaves(group.root).filter(
    (id) => id !== activeId && !excluded.includes(id) && connected.has(id),
  );
}

export function productionPanes<T extends Pick<Tab, 'hostId'>>(
  members: readonly T[],
  hosts: readonly { id: string; environmentId?: string | null }[],
): T[] {
  const prod = new Set(
    hosts.filter((h) => h.environmentId === PRODUCTION_ENVIRONMENT).map((h) => h.id),
  );
  return members.filter((m) => m.hostId !== null && prod.has(m.hostId));
}

/** Escreve em `sessionId` e, se o grupo dele transmite e ele é o ativo, nos destinos. */
export function sendFrom(
  sessionId: string,
  data: string,
  state: { tabs: readonly Tab[]; groups: Record<string, Group>; activeId: string | null },
): void {
  send(sessionId, data);
  if (state.activeId !== sessionId) return;
  for (const id of broadcastTargets(state.tabs, state.groups, sessionId)) send(id, data);
}

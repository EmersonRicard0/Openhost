// Papel de um painel na transmissão do grupo (specs/012, contracts/ui.md).
import { useHosts } from '../../stores/hosts';
import { groupOf, useSessions } from '../../stores/sessions';
import { broadcastTargets, PRODUCTION_ENVIRONMENT } from './broadcast';

export type BroadcastRole =
  | { kind: 'off' }
  /** Painel ativo: o que se digita nele sai para `count` painéis. */
  | { kind: 'send'; groupId: string; count: number; production: boolean }
  /** Outro painel do grupo; `receiving` = marcado e conectado. */
  | {
      kind: 'receive';
      groupId: string;
      marked: boolean;
      connected: boolean;
      production: boolean;
    };

export function useBroadcastRole(sessionId: string): BroadcastRole {
  const groups = useSessions((st) => st.groups);
  const tabs = useSessions((st) => st.tabs);
  const activeId = useSessions((st) => st.activeId);
  const hostId = tabs.find((tb) => tb.id === sessionId)?.hostId ?? null;
  const production = useHosts(
    (h) =>
      hostId !== null &&
      h.hosts.find((x) => x.id === hostId)?.environmentId === PRODUCTION_ENVIRONMENT,
  );
  const group = groupOf(groups, sessionId);
  if (!group?.broadcast) return { kind: 'off' };
  // O painel focado do grupo transmite, mesmo com outra aba à frente (o modo continua ligado).
  const sender = activeId && groupOf(groups, activeId) === group ? activeId : group.focusId;
  if (sender === sessionId)
    return {
      kind: 'send',
      groupId: group.id,
      count: broadcastTargets(tabs, groups, sessionId).length,
      production,
    };
  return {
    kind: 'receive',
    groupId: group.id,
    marked: !group.broadcast.excluded.includes(sessionId),
    connected: tabs.find((tb) => tb.id === sessionId)?.state === 'connected',
    production,
  };
}

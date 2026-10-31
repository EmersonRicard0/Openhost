// Ambiente do host (specs/009, US1): lista do cofre e o ambiente de cada host.
import type { Environment, VaultSettings } from '@shared/model/types';
import { useHosts } from '../../stores/hosts';
import { useVault } from '../../stores/vault';

/** Mesmos padrões do Go para cofre sem a lista (data-model.md). */
export const DEFAULT_ENVIRONMENTS: readonly Environment[] = [
  { id: 'prod', name: 'Produção', color: 'red' },
  { id: 'staging', name: 'Homologação', color: 'amber' },
  { id: 'lab', name: 'Laboratório', color: 'green' },
  { id: 'customer', name: 'Cliente', color: 'slate' },
];

export const MAX_ENVIRONMENTS = 12;

export function environmentsOf(settings: VaultSettings | null): readonly Environment[] {
  return settings?.environments ?? DEFAULT_ENVIRONMENTS;
}

/** Ambiente do id, ou `null` (sem ambiente ou ambiente removido). */
export function environmentById(
  list: readonly Environment[],
  id: string | null | undefined,
): Environment | null {
  return id ? (list.find((e) => e.id === id) ?? null) : null;
}

/** Ambiente atual do host da sessão; acompanha edições do host e da lista (FR-906). */
export function useHostEnvironment(hostId: string | null): Environment | null {
  const environmentId = useHosts((h) =>
    hostId ? h.hosts.find((x) => x.id === hostId)?.environmentId : null,
  );
  const settings = useVault((v) => v.settings);
  return environmentById(environmentsOf(settings), environmentId);
}

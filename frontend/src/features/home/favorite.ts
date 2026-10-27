import type { HostView } from '@shared/model/types';
import { useHosts } from '../../stores/hosts';
import { toastError } from '../../ui/Toast';

/** Marca ou desmarca o favorito (specs/010, FR-1011); os demais campos novos ficam como estão. */
export async function setFavorite(host: HostView, favorite: boolean): Promise<void> {
  const res = await window.shellvault.hosts.update(host.id, {
    label: host.label,
    address: host.address,
    port: host.port,
    username: host.username,
    authMethod: host.authMethod,
    credentialId: host.credentialId,
    groupId: host.groupId,
    legacyAlgorithms: host.legacyAlgorithms,
    osIcon: host.osIcon ?? 'auto',
    favorite,
  });
  if (!res.ok) {
    toastError(res.error);
    return;
  }
  await useHosts.getState().reload();
}

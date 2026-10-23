import type { HostView } from '@shared/model/types';
import { useSessions } from '../../stores/sessions';
import { useUi } from '../../stores/ui';
import { toastError } from '../../ui/Toast';
import { initialSize } from '../terminal/dataBus';

export async function connectHost(host: HostView): Promise<void> {
  const size = initialSize(useUi.getState().settings?.terminalFontSize ?? 14);
  const res = await window.shellvault.sessions.openSsh(host.id, size);
  if (!res.ok) {
    toastError(res.error);
    return;
  }
  useSessions.getState().add({
    id: res.value.sessionId,
    kind: 'ssh',
    title: host.label,
    hostId: host.id,
    shell: null,
    state: 'connecting',
  });
}

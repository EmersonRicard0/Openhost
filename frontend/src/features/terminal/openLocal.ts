// Abre uma aba de terminal local (US4); funciona com o cofre bloqueado.
import type { LocalShell } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useSessions } from '../../stores/sessions';
import { toastError } from '../../ui/Toast';

const TITLES: Record<LocalShell, string> = {
  powershell: t.terminal.powershell,
  cmd: t.terminal.cmd,
};

export async function openLocal(shell: LocalShell): Promise<void> {
  const res = await window.shellvault.sessions.openLocal(shell);
  if (!res.ok) {
    toastError(res.error);
    return;
  }
  useSessions.getState().add({
    id: res.value.sessionId,
    kind: 'local',
    title: TITLES[shell],
    hostId: null,
    shell,
    state: 'connecting',
  });
}

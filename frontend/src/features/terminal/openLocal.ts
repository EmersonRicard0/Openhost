// Abre uma aba de terminal local (US4); funciona com o cofre bloqueado.
import type { LocalShell } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useSessions } from '../../stores/sessions';
import { useUi } from '../../stores/ui';
import { toastError } from '../../ui/Toast';
import { initialSize } from './dataBus';

const TITLES: Record<LocalShell, string> = {
  powershell: t.terminal.powershell,
  cmd: t.terminal.cmd,
};

export async function openLocal(shell: LocalShell): Promise<void> {
  const size = initialSize(useUi.getState().settings?.terminalFontSize ?? 14);
  const res = await window.shellvault.sessions.openLocal(shell, size);
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
    state: 'running',
  });
}

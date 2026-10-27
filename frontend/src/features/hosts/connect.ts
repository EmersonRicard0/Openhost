import type { HostView, QuickTarget, RecentEntryInput } from '@shared/model/types';
import { useSessions } from '../../stores/sessions';
import { useUi } from '../../stores/ui';
import { toastError } from '../../ui/Toast';
import { targetLabel } from '../home/quickTarget';

export async function connectHost(host: HostView): Promise<void> {
  const res = await window.shellvault.sessions.openSsh(host.id);
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
  rememberWhenConnected(res.value.sessionId, { kind: 'host', hostId: host.id });
}

/** Sessão SSH sem host salvo (specs/010, FR-1002); a senha vem pelo prompt a cada conexão. */
export async function connectQuick(target: QuickTarget): Promise<void> {
  const res = await window.shellvault.sessions.openQuick(target);
  if (!res.ok) {
    toastError(res.error);
    return;
  }
  useSessions.getState().add({
    id: res.value.sessionId,
    kind: 'ssh',
    title: targetLabel(target),
    hostId: null,
    shell: null,
    state: 'connecting',
    quick: target,
  });
  rememberWhenConnected(res.value.sessionId, { kind: 'quick', ...target });
}

/** Recente só quando a sessão conecta de fato (spec, Assumptions). */
function rememberWhenConnected(sessionId: string, entry: RecentEntryInput): void {
  const stop = useSessions.subscribe((state) => {
    const tab = state.tabs.find((t) => t.id === sessionId);
    if (tab?.state === 'connected') {
      stop();
      void window.shellvault.app.recordRecent(entry).then((res) => {
        const settings = useUi.getState().settings;
        if (res.ok && settings) useUi.getState().setSettings({ ...settings, recents: res.value });
      });
    } else if (!tab || tab.state === 'closed') stop();
  });
}

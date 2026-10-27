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
  let recorded = false;
  let stop = () => {};
  const record = () => {
    if (recorded) return;
    recorded = true;
    stop();
    void window.shellvault.app.recordRecent(entry).then((res) => {
      const settings = useUi.getState().settings;
      if (res.ok && settings) useUi.getState().setSettings({ ...settings, recents: res.value });
    });
  };
  stop = useSessions.subscribe((state) => {
    const tab = state.tabs.find((t) => t.id === sessionId);
    if (tab?.state === 'connected') {
      record();
    } else if (!tab || tab.state === 'closed') stop();
  });
  // A localhost session can connect before OpenQuick/OpenSsh resolves and the subscription is
  // installed. Check the current snapshot too so that fast connects are still recorded.
  const current = useSessions.getState().tabs.find((tab) => tab.id === sessionId);
  if (current?.state === 'connected') record();
  else if (!current || current.state === 'closed') stop();
}

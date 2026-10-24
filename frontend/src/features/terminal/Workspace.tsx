import { useEffect } from 'react';
import { t } from '../../i18n/pt-BR';
import { closeTab, useSessions, type Tab } from '../../stores/sessions';
import { useVault } from '../../stores/vault';
import { Button } from '../../ui/Button';
import { RefreshIcon, TerminalIcon } from '../../ui/icons';
import { toastError } from '../../ui/Toast';
import { focusUnlock } from '../vault/UnlockScreen';
import { ConflictDialog } from '../sftp/ConflictDialog';
import { SftpView } from '../sftp/SftpView';
import { HostKeyDialog } from './HostKeyDialog';
import { openLocal } from './openLocal';
import { PromptDialog } from './PromptDialog';
import { TabBar } from './TabBar';
import { TerminalView } from './TerminalView';
import s from './terminal.module.css';
import app from '../../app/app.module.css';

async function reconnect(tab: Tab): Promise<void> {
  if (useVault.getState().status?.state !== 'unlocked') {
    toastError(t.terminal.unlockToReconnect);
    focusUnlock();
    return;
  }
  useSessions.getState().setState(tab.id, 'connecting', null, null);
  const res = await window.shellvault.sessions.reconnect(tab.id);
  if (!res.ok) toastError(res.error);
}

function Banner({ tab }: { tab: Tab }) {
  if (tab.state === 'disconnected' || tab.state === 'error') {
    return (
      <div className={s.banner} role="status">
        <span className={s.bannerText}>
          {t.terminal.disconnected}
          {tab.reason ? ` — ${tab.reason}` : ''}
        </span>
        {tab.kind === 'ssh' && (
          <Button variant="primary" onClick={() => void reconnect(tab)}>
            <RefreshIcon />
            {t.terminal.reconnect}
          </Button>
        )}
      </div>
    );
  }
  if (tab.state === 'closed') {
    return (
      <div className={s.banner} role="status">
        <span className={s.bannerText}>{t.terminal.exited(tab.exitCode)}</span>
        <Button onClick={() => void closeTab(tab.id)}>{t.terminal.closeTab}</Button>
      </div>
    );
  }
  return null;
}

const NEW_LOCAL = [
  { label: t.terminal.powershell, onSelect: () => void openLocal('powershell') },
  { label: t.terminal.cmd, onSelect: () => void openLocal('cmd') },
];

export function Workspace() {
  const { tabs, activeId } = useSessions();

  // Ctrl+Shift+T abre PowerShell; captura antes do xterm para não virar ^T.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyT') {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) void openLocal('powershell');
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  return (
    <>
      <TabBar newTabItems={NEW_LOCAL} />
      <div className={`${app.content} solid`} data-terminal-area>
        {tabs.length === 0 && (
          <div className={app.empty}>
            <span className={app.emptyIcon}>
              <TerminalIcon width={28} height={28} />
            </span>
            <p className={app.emptyTitle}>{t.terminal.emptyTitle}</p>
            <p className={app.emptyHint}>{t.terminal.emptyHint}</p>
          </div>
        )}
        {tabs.map((tab) =>
          tab.kind === 'sftp' ? (
            <SftpView key={tab.id} tab={tab} active={tab.id === activeId} />
          ) : (
            <TerminalView
              key={tab.id}
              tab={tab}
              active={tab.id === activeId}
              banner={<Banner tab={tab} />}
            />
          ),
        )}
      </div>
      <HostKeyDialog />
      <PromptDialog />
      <ConflictDialog />
    </>
  );
}

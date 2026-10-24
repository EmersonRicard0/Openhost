import { useEffect } from 'react';
import { installShortcuts } from '../../app/shortcuts';
import { currentKeymap, useShortcutLabel } from '../../app/useShortcuts';
import { t } from '../../i18n/pt-BR';
import { closeTab, useSessions, type Tab } from '../../stores/sessions';
import { useWorkspace } from '../../stores/workspace';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Button } from '../../ui/Button';
import { RefreshIcon, TerminalIcon } from '../../ui/icons';
import { ConflictDialog } from '../sftp/ConflictDialog';
import { SettingsPage } from '../settings/SettingsPage';
import { SftpView } from '../sftp/SftpView';
import { runShortcut } from './commands';
import { HostKeyDialog } from './HostKeyDialog';
import { openLocal } from './openLocal';
import { reconnect } from './reconnect';
import { PasteConfirmDialog } from './PasteConfirmDialog';
import { PromptDialog } from './PromptDialog';
import { TabBar } from './TabBar';
import { TerminalView } from './TerminalView';
import s from './terminal.module.css';
import app from '../../app/app.module.css';

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

function CloseTabConfirm() {
  const id = useWorkspace((w) => w.confirmClose);
  const setConfirmClose = useWorkspace((w) => w.setConfirmClose);
  const tab = useSessions((st) => st.tabs.find((tb) => tb.id === id));
  if (!id || !tab) return null;
  return (
    <ConfirmDialog
      title={t.terminal.closeConnected.title}
      message={t.terminal.closeConnected.message(tab.title)}
      confirmLabel={t.terminal.closeConnected.confirm}
      danger
      onCancel={() => {
        setConfirmClose(null);
      }}
      onConfirm={() => {
        setConfirmClose(null);
        void closeTab(id);
      }}
    />
  );
}

const NEW_LOCAL = [
  { label: t.terminal.powershell, onSelect: () => void openLocal('powershell') },
  { label: t.terminal.cmd, onSelect: () => void openLocal('cmd') },
];

export function Workspace() {
  const { tabs, activeId } = useSessions();
  const settings = useWorkspace((w) => w.view === 'settings');
  const newTabShortcut = useShortcutLabel('newTab');

  // Atalhos de FR-140/FR-173, capturados antes do xterm para não virarem caracteres de controle.
  useEffect(() => installShortcuts(runShortcut, currentKeymap), []);

  return (
    <>
      <TabBar newTabItems={NEW_LOCAL} />
      <div className={`${app.content} solid`} data-terminal-area>
        {/* Sob a página de configurações as abas ficam escondidas, não desmontadas:
            sessões e tamanho do xterm seguem intactos (FR-168). */}
        <div className={app.workspaceLayer} inert={settings}>
          {tabs.length === 0 && (
            <div className={app.empty}>
              <span className={app.emptyIcon}>
                <TerminalIcon width={28} height={28} />
              </span>
              <p className={app.emptyTitle}>{t.terminal.emptyTitle}</p>
              <p className={app.emptyHint}>{t.terminal.emptyHint(newTabShortcut)}</p>
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
        {settings && <SettingsPage />}
      </div>
      <HostKeyDialog />
      <PromptDialog />
      <PasteConfirmDialog />
      <CloseTabConfirm />
      <ConflictDialog />
    </>
  );
}

import { useEffect } from 'react';
import { CommandPalette } from '../features/palette/CommandPalette';
import { ActiveForwardsDialog } from '../features/forwarding/ActiveForwardsDialog';
import { Sidebar } from '../features/sidebar/Sidebar';
import { toggleSidebar } from '../features/terminal/commands';
import { Workspace } from '../features/terminal/Workspace';
import { CreateVaultScreen } from '../features/vault/CreateVaultScreen';
import { UnreadableScreen } from '../features/vault/UnreadableScreen';
import { t } from '../i18n/pt-BR';
import { useSessions } from '../stores/sessions';
import { useUi } from '../stores/ui';
import { subscribeVault, useVault } from '../stores/vault';
import { useWorkspace } from '../stores/workspace';
import { Button } from '../ui/Button';
import { LockIcon, SettingsIcon, SidebarCollapseIcon, SidebarExpandIcon } from '../ui/icons';
import { Toasts } from '../ui/Toast';
import { trackActivity } from './activity';
import { CloseConfirmDialog } from './CloseConfirmDialog';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { useShortcutLabel, withShortcut } from './useShortcuts';
import s from './app.module.css';

function FullscreenFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${s.fullscreen} ${s.backdrop} glass`}>
      <TitleBar />
      <div className={s.fullscreenBody}>{children}</div>
    </div>
  );
}

export function App() {
  const { status, refresh, lock } = useVault();
  const view = useWorkspace((w) => w.view);
  const collapsed = useUi((u) => u.settings?.sidebarCollapsed ?? false);
  const sidebarLabel = withShortcut(
    collapsed ? t.sidebar.expand : t.sidebar.collapse,
    useShortcutLabel('toggleSidebar'),
  );
  const setView = useWorkspace((w) => w.setView);

  useEffect(() => {
    subscribeVault();
    void refresh();
    return trackActivity(() => void window.shellvault.vault.reportActivity());
  }, [refresh]);

  // Abrir ou trocar de aba (não fechar) leva de volta às abas.
  useEffect(
    () =>
      useSessions.subscribe((next, prev) => {
        if (next.activeId !== prev.activeId && next.tabs.length >= prev.tabs.length) {
          useWorkspace.getState().setView('terminal');
        }
      }),
    [],
  );

  // Cofre apagado: ao criar o novo, começa pelas abas.
  useEffect(() => {
    if (status?.state === 'nonexistent') setView('terminal');
  }, [status?.state, setView]);

  if (!status) return null;

  if (status.state === 'nonexistent') {
    return (
      <FullscreenFrame>
        <CreateVaultScreen />
        <Toasts />
      </FullscreenFrame>
    );
  }
  if (status.state === 'unreadable') {
    return (
      <FullscreenFrame>
        <UnreadableScreen />
        <Toasts />
      </FullscreenFrame>
    );
  }

  const unlocked = status.state === 'unlocked';
  return (
    <div className={`${s.root} ${s.backdrop} glass`} data-sidebar={collapsed ? 'rail' : 'full'}>
      <TitleBar
        leading={
          <Button
            variant="ghost"
            iconOnly
            aria-label={sidebarLabel}
            title={sidebarLabel}
            aria-expanded={!collapsed}
            onClick={toggleSidebar}
          >
            {collapsed ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}
          </Button>
        }
        actions={
          <>
            {unlocked && (
              <Button
                variant="ghost"
                iconOnly
                aria-label={t.vault.lock}
                title={t.vault.lock}
                onClick={() => void lock()}
              >
                <LockIcon />
              </Button>
            )}
            <Button
              variant="ghost"
              iconOnly
              aria-label={t.settings.title}
              title={t.settings.title}
              aria-pressed={view === 'settings'}
              onClick={() => {
                setView(view === 'settings' ? 'terminal' : 'settings');
              }}
            >
              <SettingsIcon />
            </Button>
          </>
        }
      />
      {/* Bloqueado: o painel de desbloqueio ocupa só a barra lateral; abas seguem ativas. */}
      <aside className={s.sidebar}>
        <Sidebar />
      </aside>
      <main className={s.main}>
        <Workspace />
      </main>
      <StatusBar />
      <ActiveForwardsDialog />
      <CommandPalette />
      <CloseConfirmDialog />
      <Toasts />
    </div>
  );
}

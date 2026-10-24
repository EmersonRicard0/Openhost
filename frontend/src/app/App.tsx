import { useEffect, useState } from 'react';
import { ForwardsIndicator } from '../features/forwarding/ForwardsIndicator';
import { SettingsDialog } from '../features/settings/SettingsDialog';
import { Workspace } from '../features/terminal/Workspace';
import { CreateVaultScreen } from '../features/vault/CreateVaultScreen';
import { UnlockPanel } from '../features/vault/UnlockScreen';
import { UnreadableScreen } from '../features/vault/UnreadableScreen';
import { HostSidebar } from '../features/hosts/HostSidebar';
import { t } from '../i18n/pt-BR';
import { subscribeVault, useVault } from '../stores/vault';
import { Button } from '../ui/Button';
import { LockIcon, SettingsIcon } from '../ui/icons';
import { Toasts } from '../ui/Toast';
import { trackActivity } from './activity';
import { CloseConfirmDialog } from './CloseConfirmDialog';
import { TitleBar } from './TitleBar';
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    subscribeVault();
    void refresh();
    return trackActivity(() => void window.shellvault.vault.reportActivity());
  }, [refresh]);

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
    <div className={`${s.root} ${s.backdrop} glass`}>
      <TitleBar
        actions={
          <>
            <ForwardsIndicator />
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
              onClick={() => {
                setSettingsOpen(true);
              }}
            >
              <SettingsIcon />
            </Button>
          </>
        }
      />
      {/* Bloqueado: o painel de desbloqueio ocupa só a barra lateral; abas seguem ativas. */}
      <aside className={s.sidebar}>{unlocked ? <HostSidebar /> : <UnlockPanel />}</aside>
      <main className={s.main}>
        <Workspace />
      </main>
      {settingsOpen && (
        <SettingsDialog
          onClose={() => {
            setSettingsOpen(false);
          }}
        />
      )}
      <CloseConfirmDialog />
      <Toasts />
    </div>
  );
}

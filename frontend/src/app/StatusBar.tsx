// Barra de status (FR-172): latência da sessão SSH ativa, túneis e cofre; cada item leva à ação.
// Nome e estado da aba já aparecem na própria aba, então não se repetem aqui.
import { focusUnlock } from '../features/vault/UnlockScreen';
import { t } from '../i18n/pt-BR';
import { useForwards } from '../stores/forwards';
import { useSessions } from '../stores/sessions';
import { hasUpdate, useUpdates } from '../stores/updates';
import { useVault } from '../stores/vault';
import { useWorkspace } from '../stores/workspace';
import { DownloadIcon, ForwardIcon, LockIcon, UnlockIcon } from '../ui/icons';
import { latencyLevel } from './latency';
import s from './statusbar.module.css';

export function StatusBar() {
  const tab = useSessions((st) => st.tabs.find((x) => x.id === st.activeId) ?? null);
  const running = useForwards((st) => st.active.filter((a) => a.status === 'active').length);
  const anyForward = useForwards((st) => st.active.length > 0);
  const vault = useVault((st) => st.status?.state);
  const lock = useVault((st) => st.lock);
  const setForwardsOpen = useWorkspace((w) => w.setForwardsOpen);

  const unlocked = vault === 'unlocked';
  const update = useUpdates((u) => u.info);
  const openUpdate = useUpdates((u) => u.setOpen);

  return (
    <footer className={s.bar} aria-label={t.status.label}>
      {tab && tab.latencyMs !== null && tab.state === 'connected' && (
        <span
          className={s.latency}
          data-level={latencyLevel(tab.latencyMs)}
          title={t.status.latencyTitle}
          data-testid="status-latency"
        >
          {t.status.latency(tab.latencyMs)}
        </span>
      )}
      <span className={s.spacer} />
      {hasUpdate(update) && (
        <button
          type="button"
          className={s.item}
          title={t.updates.statusTitle}
          data-testid="status-update"
          onClick={() => {
            openUpdate(true);
          }}
        >
          <DownloadIcon />
          {update?.state === 'ready' ? t.updates.statusReady : t.updates.statusAvailable}
        </button>
      )}
      {anyForward && (
        <button
          type="button"
          className={s.item}
          title={t.status.forwardsTitle}
          aria-label={t.forwarding.activeCount(running)}
          onClick={() => {
            setForwardsOpen(true);
          }}
        >
          <ForwardIcon />
          {t.status.forwards(running)}
        </button>
      )}
      {(vault === 'unlocked' || vault === 'locked') && (
        <button
          type="button"
          className={s.item}
          title={unlocked ? t.status.lockTitle : t.status.unlockTitle}
          onClick={() => {
            if (unlocked) void lock();
            else focusUnlock();
          }}
        >
          {unlocked ? <UnlockIcon /> : <LockIcon />}
          {unlocked ? t.status.vaultUnlocked : t.status.vaultLocked}
        </button>
      )}
    </footer>
  );
}

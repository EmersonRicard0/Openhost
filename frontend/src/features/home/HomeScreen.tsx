// Tela inicial sem sessão aberta (specs/010, FR-1008): conexão rápida, favoritos e recentes.
import { useMemo } from 'react';
import { useShortcutLabel, withShortcut } from '../../app/useShortcuts';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { useUi } from '../../stores/ui';
import { Button } from '../../ui/Button';
import { TerminalIcon } from '../../ui/icons';
import { connectQuick } from '../hosts/connect';
import { openLocal } from '../terminal/openLocal';
import { HostCard, QuickCard } from './HostCard';
import { QuickConnectBar } from './QuickConnectBar';
import { visibleRecents } from './recents';
import s from './home.module.css';

export function HomeScreen() {
  const hosts = useHosts((h) => h.hosts);
  const recents = useUi((u) => u.settings?.recents);
  const defaultShell = useUi((u) => u.settings?.defaultShell);
  const newTabShortcut = useShortcutLabel('newTab');
  const favorites = useMemo(
    () =>
      hosts
        .filter((h) => h.favorite)
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' })),
    [hosts],
  );
  const recent = useMemo(() => visibleRecents(recents ?? [], hosts), [recents, hosts]);

  return (
    <section className={s.home} aria-label={t.home.title}>
      <QuickConnectBar />
      {favorites.length > 0 && (
        <section className={s.block} aria-label={t.home.favorites}>
          <h2 className={s.blockTitle}>{t.home.favorites}</h2>
          <div className={s.grid}>
            {favorites.map((host) => (
              <HostCard key={host.id} host={host} />
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section className={s.block} aria-label={t.home.recents}>
          <h2 className={s.blockTitle}>{t.home.recents}</h2>
          <div className={s.grid}>
            {recent.map((item) =>
              item.kind === 'host' ? (
                <HostCard key={item.key} host={item.host} />
              ) : (
                <QuickCard
                  key={item.key}
                  label={item.label}
                  onOpen={() => void connectQuick(item.target)}
                />
              ),
            )}
          </div>
        </section>
      )}
      {favorites.length === 0 && recent.length === 0 && (
        <p className={s.emptyHint}>{t.home.emptyHint}</p>
      )}
      {defaultShell && (
        <Button
          className={s.local}
          title={withShortcut(t.terminal.emptyAction, newTabShortcut)}
          onClick={() => void openLocal(defaultShell)}
        >
          <TerminalIcon />
          {t.terminal.emptyAction}
        </Button>
      )}
    </section>
  );
}

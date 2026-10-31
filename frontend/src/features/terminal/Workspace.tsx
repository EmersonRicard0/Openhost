import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { installShortcuts } from '../../app/shortcuts';
import { currentKeymap, useShortcutLabel } from '../../app/useShortcuts';
import { t } from '../../i18n/pt-BR';
import { closeTab, groupOf, isLive, useSessions, type Tab } from '../../stores/sessions';
import { useShells } from '../../stores/shells';
import { useUi } from '../../stores/ui';
import { useWorkspace } from '../../stores/workspace';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Button } from '../../ui/Button';
import { DisconnectedIcon, ErrorIcon, ExitedIcon, RefreshIcon, TerminalIcon } from '../../ui/icons';
import { ShellIcon } from '../../ui/ShellIcon';
import { ConflictDialog } from '../sftp/ConflictDialog';
import { SettingsPage } from '../settings/SettingsPage';
import { SftpView } from '../sftp/SftpView';
import { MAX_ATTEMPTS, stopAutoReconnect, useAutoReconnect } from './autoReconnect';
import { runShortcut } from './commands';
import { useDrag } from './dragState';
import { Divider } from './Divider';
import { DropLayer } from './DropLayer';
import { HostKeyDialog } from './HostKeyDialog';
import { leaves, rects, type Rect } from './layout';
import { openLocal } from './openLocal';
import { reconnect } from './reconnect';
import { PaneHeader } from './PaneHeader';
import { PasteConfirmDialog } from './PasteConfirmDialog';
import { PromptDialog } from './PromptDialog';
import { TabBar } from './TabBar';
import { TerminalView } from './TerminalView';
import s from './terminal.module.css';
import app from '../../app/app.module.css';

/** Segundos até a próxima tentativa automática, atualizados a cada segundo. */
function useSecondsUntil(at: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === undefined) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      clearInterval(timer);
    };
  }, [at]);
  return at === undefined ? 0 : Math.max(0, Math.ceil((at - now) / 1_000));
}

/** Metade da divisória de 1 px (research R3): cada painel recua meio pixel nas bordas internas. */
const HALF_GAP = 0.5;

/** Posição de um painel em porcentagem da área, descontando a divisória nas bordas internas. */
function paneStyle(r: Rect): CSSProperties {
  const edge = (start: number, size: number) => {
    const before = start > 0 ? HALF_GAP : 0;
    const after = start + size < 1 ? HALF_GAP : 0;
    return {
      at: `calc(${String(start * 100)}% + ${String(before)}px)`,
      size: `calc(${String(size * 100)}% - ${String(before + after)}px)`,
    };
  };
  const x = edge(r.x, r.w);
  const y = edge(r.y, r.h);
  return { left: x.at, width: x.size, top: y.at, height: y.size };
}

function BannerIcon({ state }: { state: Tab['state'] }) {
  if (state === 'closed') return <ExitedIcon className={s.bannerIcon} aria-hidden />;
  const Icon = state === 'error' ? ErrorIcon : DisconnectedIcon;
  return <Icon className={`${s.bannerIcon} ${s.bannerIconDanger}`} aria-hidden />;
}

function Banner({ tab }: { tab: Tab }) {
  const pending = useAutoReconnect((r) => r.pending[tab.id]);
  const seconds = useSecondsUntil(pending?.at);
  if (pending && (tab.state === 'disconnected' || tab.state === 'error')) {
    return (
      <div className={s.banner} role="status">
        <BannerIcon state={tab.state} />
        <span className={s.bannerText}>
          {t.terminal.reconnectIn(seconds, pending.attempt, MAX_ATTEMPTS)}
          {tab.reason ? ` — ${tab.reason}` : ''}
        </span>
        <Button
          onClick={() => {
            stopAutoReconnect(tab.id);
          }}
        >
          {t.terminal.reconnectCancel}
        </Button>
        <Button variant="primary" onClick={() => void reconnect(tab)}>
          <RefreshIcon />
          {t.terminal.reconnect}
        </Button>
      </div>
    );
  }
  if (tab.state === 'disconnected' || tab.state === 'error') {
    return (
      <div className={s.banner} role="status">
        <BannerIcon state={tab.state} />
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
        <BannerIcon state={tab.state} />
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
  const tabs = useSessions((st) => st.tabs);
  // Sessão avulsa ou painel; ou a aba de um grupo inteiro (FR-613).
  const group = useSessions((st) => (id ? st.groups[id] : undefined));
  if (!id) return null;
  const tab = tabs.find((tb) => tb.id === id);
  const members = group ? leaves(group.root) : [];
  const live = tabs.filter(
    (tb) => members.includes(tb.id) && tb.kind !== 'local' && isLive(tb.state),
  ).length;
  if (!tab && !group) return null;
  return (
    <ConfirmDialog
      title={t.terminal.closeConnected.title}
      message={
        tab
          ? t.terminal.closeConnected.message(tab.title)
          : t.terminal.closeConnected.groupMessage(members.length, live)
      }
      confirmLabel={t.terminal.closeConnected.confirm}
      danger
      onCancel={() => {
        setConfirmClose(null);
      }}
      onConfirm={() => {
        setConfirmClose(null);
        for (const sid of tab ? [id] : members) void closeTab(sid);
      }}
    />
  );
}

export function Workspace() {
  const { tabs, activeId, groups, activate } = useSessions();
  // Aba ativa que é grupo: seus membros ficam visíveis lado a lado (specs/006, research R3).
  const activeGroup = activeId ? groupOf(groups, activeId) : undefined;
  const layout = useMemo(() => (activeGroup ? rects(activeGroup.root) : null), [activeGroup]);
  const panes = layout?.panes ?? {};
  const activeTab = tabs.find((tb) => tb.id === activeId);
  const settings = useWorkspace((w) => w.view === 'settings');
  const dragging = useDrag((d) => d.dragging);
  const newTabShortcut = useShortcutLabel('newTab');
  const shells = useShells((s) => s.shells);
  const defaultShell = useUi((u) => u.settings?.defaultShell);
  const newLocal = useMemo(
    () =>
      shells.map((shell) => ({
        label: shell.label,
        icon: <ShellIcon kind={shell.kind} label={shell.label} />,
        onSelect: () => void openLocal(shell.id),
      })),
    [shells],
  );

  // Atalhos de FR-140/FR-173, capturados antes do xterm para não virarem caracteres de controle.
  useEffect(() => installShortcuts(runShortcut, currentKeymap), []);

  return (
    <>
      <TabBar newTabItems={newLocal} />
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
              {defaultShell && (
                <Button
                  variant="primary"
                  className={app.emptyAction}
                  onClick={() => void openLocal(defaultShell)}
                >
                  <TerminalIcon />
                  {t.terminal.emptyAction}
                </Button>
              )}
            </div>
          )}
          {tabs.map((tab) => {
            if (tab.kind === 'sftp')
              return <SftpView key={tab.id} tab={tab} active={tab.id === activeId} />;
            const rect = panes[tab.id];
            return (
              <TerminalView
                key={tab.id}
                tab={tab}
                visible={tab.id === activeId || rect !== undefined}
                focused={tab.id === activeId}
                pane={
                  rect && {
                    style: paneStyle(rect),
                    header: <PaneHeader tab={tab} />,
                    onActivate: () => {
                      if (useSessions.getState().activeId !== tab.id) activate(tab.id);
                    },
                  }
                }
                banner={<Banner tab={tab} />}
              />
            );
          })}
        </div>
        {activeGroup &&
          !settings &&
          layout?.dividers.map((d) => (
            <Divider key={d.path.join('') || 'root'} groupId={activeGroup.id} divider={d} />
          ))}
        {dragging && !settings && activeId && <DropLayer dragging={dragging} />}
        {/* Leitor de tela anuncia o painel que recebeu o foco dentro do grupo (T019). */}
        <div className="visually-hidden" aria-live="polite">
          {activeGroup && activeTab ? t.terminal.group.focused(activeTab.title) : ''}
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

// Paleta de comandos (Ctrl+Shift+P, FR-141): busca e executa ações e conexões só pelo teclado.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { useShells } from '../../stores/shells';
import { useVault } from '../../stores/vault';
import { useWorkspace } from '../../stores/workspace';
import {
  BroadcastIcon,
  ChevronDownIcon,
  ChevronIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  DownloadIcon,
  FolderIcon,
  ImportExportIcon,
  LockIcon,
  SearchIcon,
  ServerIcon,
  SettingsIcon,
  SnippetIcon,
  ThemeIcon,
} from '../../ui/icons';
import { connectHost } from '../hosts/connect';
import { openSftp } from '../sftp/openSftp';
import {
  activeTerminalId,
  focusDir,
  openSearch,
  toggleBroadcast,
  toggleTheme,
} from '../terminal/commands';
import { groupOf, useSessions } from '../../stores/sessions';
import { checkNow, useUpdates } from '../../stores/updates';
import { toastError, toastInfo } from '../../ui/Toast';
import { openLocal } from '../terminal/openLocal';
import { useShortcutLabel } from '../../app/useShortcuts';
import { ShellIcon } from '../../ui/ShellIcon';
import { useSnippets } from '../../stores/snippets';
import { rankSnippets } from '../snippets/rank';
import { groupSize, startSend } from '../snippets/sendSnippet';
import { filterCommands, type Command } from './palette';
import s from './palette.module.css';

/** Itens mostrados de uma vez; a busca estreita o resto (1.000 hosts viram 2.000 itens). */
const LIMIT = 50;

type Entry = Command & { icon: ReactNode };

function useCommands(): Entry[] {
  const unlocked = useVault((v) => v.status?.state === 'unlocked');
  const hosts = useHosts((h) => h.hosts);
  const lock = useVault((v) => v.lock);
  const openSettings = useWorkspace((w) => w.openSettings);
  const setView = useWorkspace((w) => w.setView);
  const powershellKey = useShortcutLabel('newPowerShell') ?? '';
  const shells = useShells((x) => x.shells);
  const searchKey = useShortcutLabel('search') ?? '';
  const focusLeftKey = useShortcutLabel('focusLeft') ?? '';
  const focusRightKey = useShortcutLabel('focusRight') ?? '';
  const focusUpKey = useShortcutLabel('focusUp') ?? '';
  const focusDownKey = useShortcutLabel('focusDown') ?? '';
  const broadcastKey = useShortcutLabel('broadcast') ?? '';

  return useMemo(() => {
    const p = t.palette;
    const actions: Entry[] = shells.map((shell) => ({
      id: `local:${shell.id}`,
      label: p.newLocal(shell.label),
      hint: shell.id === 'powershell' ? powershellKey : '',
      group: 'action',
      icon: <ShellIcon kind={shell.kind} label={shell.label} />,
      run: () => void openLocal(shell.id),
    }));
    if (activeTerminalId())
      actions.push({
        id: 'search',
        label: p.search,
        hint: searchKey,
        group: 'action',
        icon: <SearchIcon />,
        run: openSearch,
      });
    // Grupo ativo: mover o foco entre painéis (specs/006, contracts/ui.md).
    const { groups, activeId } = useSessions.getState();
    const activeGroup = activeId ? groupOf(groups, activeId) : undefined;
    if (activeGroup) {
      // Digitar no grupo (specs/012, FR-1201).
      actions.push({
        id: 'broadcast',
        label: activeGroup.broadcast ? t.terminal.broadcast.off : t.terminal.broadcast.on,
        hint: broadcastKey,
        group: 'action',
        icon: <BroadcastIcon />,
        run: () => {
          toggleBroadcast(activeGroup.id);
        },
      });
      const names = t.settings.shortcutActions;
      actions.push(
        ...(
          [
            ['focusLeft', 'left', focusLeftKey, <ChevronLeftIcon key="l" />],
            ['focusRight', 'right', focusRightKey, <ChevronIcon key="r" />],
            ['focusUp', 'top', focusUpKey, <ChevronUpIcon key="u" />],
            ['focusDown', 'bottom', focusDownKey, <ChevronDownIcon key="d" />],
          ] as const
        ).map(([id, side, hint, icon]) => ({
          id,
          label: names[id],
          hint,
          group: 'action' as const,
          icon,
          run: () => {
            focusDir(side);
          },
        })),
      );
    }
    actions.push(
      {
        id: 'settings',
        label: p.settings,
        hint: '',
        group: 'action',
        icon: <SettingsIcon />,
        run: () => {
          setView('settings');
        },
      },
      {
        id: 'checkUpdates',
        label: t.updates.palette,
        hint: '',
        group: 'action',
        icon: <DownloadIcon />,
        run: () => {
          // Achando versão, o aviso abre; sem novidade ou com erro, um toast explica (FR-717).
          void checkNow().then((err) => {
            const info = useUpdates.getState().info;
            if (err) toastError(err);
            else if (info && !info.latest) toastInfo(t.updates.settings.upToDate(info.current));
          });
        },
      },
      {
        id: 'theme',
        label: p.toggleTheme,
        hint: '',
        group: 'action',
        icon: <ThemeIcon />,
        run: () => void toggleTheme(),
      },
    );
    if (!unlocked) return actions;
    actions.push({
      id: 'lock',
      label: p.lock,
      hint: '',
      group: 'action',
      icon: <LockIcon />,
      run: () => void lock(),
    });
    actions.push({
      id: 'importExport',
      label: p.importExport,
      hint: '',
      group: 'action',
      icon: <ImportExportIcon />,
      run: () => {
        openSettings('importExport');
      },
    });
    const hostEntries: Entry[] = hosts.flatMap((host) => {
      const hint = `${host.username}@${host.address}`;
      return [
        {
          id: `ssh:${host.id}`,
          label: p.connect(host.label),
          hint,
          group: 'host' as const,
          icon: <ServerIcon />,
          run: () => void connectHost(host),
        },
        {
          id: `sftp:${host.id}`,
          label: p.sftp(host.label),
          hint,
          group: 'host' as const,
          icon: <FolderIcon />,
          run: () => void openSftp(host),
        },
      ];
    });
    return [...actions, ...hostEntries];
  }, [
    shells,
    unlocked,
    hosts,
    lock,
    setView,
    openSettings,
    powershellKey,
    searchKey,
    focusLeftKey,
    broadcastKey,
    focusRightKey,
    focusUpKey,
    focusDownKey,
  ]);
}

/** Comandos salvos na ordem do fabricante do host ativo (specs/012, T017/T020/T021). */
function useSnippetEntries(query: string): Entry[] {
  const snippets = useSnippets((x) => x.snippets);
  const hosts = useHosts((h) => h.hosts);
  const activeId = useSessions((st) => st.activeId);
  const tabs = useSessions((st) => st.tabs);
  const groups = useSessions((st) => st.groups);
  return useMemo(() => {
    const terminal = activeTerminalId();
    const hostId = tabs.find((tb) => tb.id === terminal)?.hostId ?? null;
    const hostTags = hosts.find((h) => h.id === hostId)?.tags ?? [];
    const inGroup = terminal !== null && groupSize() > 1;
    return rankSnippets(snippets, hostTags, query).map((snippet) => ({
      id: `snippet:${snippet.id}`,
      label: t.palette.snippet(snippet.name),
      hint: terminal ? (snippet.text.split('\n', 1)[0] ?? '') : t.palette.snippetNoTerminal,
      group: 'snippet' as const,
      icon: <SnippetIcon />,
      disabled: terminal === null,
      run: () => {
        startSend(snippet, 'pane');
      },
      ...(inGroup
        ? {
            runGroup: () => {
              startSend(snippet, 'group');
            },
          }
        : {}),
    }));
    // activeId e groups entram para recalcular quando a sessão ativa ou o grupo mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snippets, hosts, tabs, activeId, groups, query]);
}

export function CommandPalette() {
  const open = useWorkspace((w) => w.paletteOpen);
  return open ? <Palette /> : null;
}

function Palette() {
  const setOpen = useWorkspace((w) => w.setPaletteOpen);
  const commands = useCommands();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const previous = useRef<HTMLElement | null>(null);

  const snippetEntries = useSnippetEntries(query);
  const matches = useMemo(() => {
    // Ações, depois os comandos salvos (já ordenados pelo fabricante do host), depois os hosts.
    const found = filterCommands(commands, query);
    return [
      ...found.filter((c) => c.group === 'action'),
      ...snippetEntries,
      ...found.filter((c) => c.group !== 'action'),
    ];
  }, [commands, query, snippetEntries]);
  const shown = matches.slice(0, LIMIT);
  const current = Math.min(selected, Math.max(0, shown.length - 1));
  const groupCount = shown[current]?.runGroup ? groupSize() : 0;

  useEffect(() => {
    previous.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => {
      // Sem comando executado, o foco volta para onde estava (em geral o terminal).
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${String(current)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  function close() {
    setOpen(false);
  }

  function run(command: Command | undefined, toGroup = false) {
    if (!command || command.disabled) return;
    // O comando decide o foco (nova aba foca o terminal), não o elemento anterior.
    previous.current = null;
    close();
    if (toGroup && command.runGroup) command.runGroup();
    else command.run();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const n = shown.length;
    if (e.key === 'ArrowDown' && n > 0) setSelected((current + 1) % n);
    else if (e.key === 'ArrowUp' && n > 0) setSelected((current - 1 + n) % n);
    else if (e.key === 'PageDown' && n > 0) setSelected(Math.min(n - 1, current + 8));
    else if (e.key === 'PageUp' && n > 0) setSelected(Math.max(0, current - 8));
    else if (e.key === 'Enter') run(shown[current], e.shiftKey);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') {
      // Foco preso no campo: a lista é navegada pelas setas.
    } else return;
    e.preventDefault();
  }

  return createPortal(
    <div
      className={s.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.palette.label}
        data-palette
        className={`${s.palette} raised glass-edge`}
        onKeyDown={onKeyDown}
      >
        <div className={s.field}>
          <SearchIcon className={s.fieldIcon} />
          <input
            ref={inputRef}
            className={s.input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={shown.length ? `${listId}-${String(current)}` : undefined}
            aria-label={t.palette.label}
            placeholder={t.palette.placeholder}
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
          />
          <kbd className={s.kbd}>Esc</kbd>
        </div>
        {shown.length === 0 ? (
          <p className={s.empty}>{t.palette.empty}</p>
        ) : (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className={s.list}
            aria-label={t.palette.label}
          >
            {shown.map((command, i) => (
              <li
                key={command.id}
                id={`${listId}-${String(i)}`}
                role="option"
                aria-selected={i === current}
                aria-disabled={command.disabled ? true : undefined}
                data-index={i}
                data-group={command.group}
                className={s.item}
                onMouseMove={() => {
                  if (i !== current) setSelected(i);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  run(command, e.shiftKey);
                }}
              >
                <span className={s.itemIcon}>{(command as Entry).icon}</span>
                <span className={s.itemLabel}>{command.label}</span>
                {command.hint && <span className={s.itemHint}>{command.hint}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className={s.footer} aria-hidden>
          <span>
            <kbd className={s.kbd}>↑</kbd>
            <kbd className={s.kbd}>↓</kbd> {t.palette.navigate}
          </span>
          {groupCount > 1 ? (
            <>
              <span>
                <kbd className={s.kbd}>Enter</kbd> {t.palette.sendPane}
              </span>
              <span>
                <kbd className={s.kbd}>Shift+Enter</kbd> {t.palette.sendGroup(groupCount)}
              </span>
            </>
          ) : (
            <span>
              <kbd className={s.kbd}>Enter</kbd> {t.palette.run}
            </span>
          )}
          <span className={s.footerCount}>{t.palette.results(matches.length)}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

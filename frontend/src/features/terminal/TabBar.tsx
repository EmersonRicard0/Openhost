import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { t } from '../../i18n/pt-BR';
import type { Platform, SendKeysCombo } from '@shared/model/types';
import {
  closeTab,
  isLive,
  stripItems,
  useSessions,
  type StripItem,
  type Tab,
} from '../../stores/sessions';
import { useUi } from '../../stores/ui';
import { useWorkspace } from '../../stores/workspace';
import { Button } from '../../ui/Button';
import { useSlidingIndicator } from '../../ui/motion';
import {
  ChevronDownIcon,
  ChevronIcon,
  ChevronLeftIcon,
  CloseIcon,
  ConnectedIcon,
  ConnectingIcon,
  DisconnectedIcon,
  ErrorIcon,
  ExitedIcon,
  KeyboardIcon,
  PlusIcon,
  RenameIcon,
} from '../../ui/icons';
import { Menu, type MenuItem } from '../../ui/Menu';
import { toastError } from '../../ui/Toast';
import { closeActiveTab } from './commands';
import { endDrag, startDrag } from './dragState';
import s from './terminal.module.css';

function stateLabel(tab: Tab): string {
  switch (tab.state) {
    case 'connected':
      return tab.title;
    case 'disconnected':
      return `${tab.title} — ${t.terminal.disconnected}`;
    case 'closed':
      return `${tab.title} — ${t.terminal.exited(tab.exitCode)}`;
    default:
      return `${tab.title} — ${t.terminal.connecting}`;
  }
}

/** Estado da aba por cor e por forma (FR-163): quem não distingue as cores vê o ícone. */
function StateIcon({ state }: { state: Tab['state'] }) {
  const Icon =
    state === 'connected'
      ? ConnectedIcon
      : state === 'disconnected'
        ? DisconnectedIcon
        : state === 'error'
          ? ErrorIcon
          : state === 'closed'
            ? ExitedIcon
            : ConnectingIcon;
  return (
    <span className={s.state} data-state={state} aria-hidden>
      <Icon width={13} height={13} />
    </span>
  );
}

/** Do pior ao melhor: a aba de um grupo mostra o pior estado entre as sessões (FR-611). */
const STATE_RANK: Tab['state'][] = ['error', 'disconnected', 'closed', 'connecting', 'connected'];

function worstState(members: Tab[]): Tab['state'] {
  return members.reduce<Tab['state']>((worst, m) => {
    const rank = (st: Tab['state']) => {
      const i = STATE_RANK.indexOf(st);
      return i < 0 ? STATE_RANK.indexOf('connecting') : i;
    };
    return rank(m.state) < rank(worst) ? m.state : worst;
  }, 'connected');
}

/** Combinações que o app usa como atalho; o menu da aba as envia ao shell (FR-140). */
const SEND_KEYS: [SendKeysCombo, string][] = [
  ['ctrl+w', 'Ctrl+W'],
  ['ctrl+t', 'Ctrl+T'],
  ['ctrl+tab', 'Ctrl+Tab'],
  ['ctrl+k', 'Ctrl+K'],
  ['ctrl+b', 'Ctrl+B'],
];

/** No macOS o app só captura ⌃Tab; as outras combinações com ⌃ já chegam ao terminal. */
const SEND_KEYS_MAC: [SendKeysCombo, string][] = [['ctrl+tab', '⌃Tab']];

function tabMenu(tab: Tab, platform: Platform, startRename: () => void): MenuItem[] {
  const items: MenuItem[] = [
    { label: t.terminal.renameTab, icon: <RenameIcon />, onSelect: startRename },
  ];
  if (tab.kind !== 'sftp' && isLive(tab.state))
    for (const [combo, label] of platform === 'darwin' ? SEND_KEYS_MAC : SEND_KEYS)
      items.push({
        label: t.terminal.sendKeys(label),
        icon: <KeyboardIcon />,
        onSelect: () => {
          void window.shellvault.sessions.sendKeys(tab.id, combo).then((res) => {
            if (!res.ok) toastError(res.error);
          });
        },
      });
  items.push({
    label: t.terminal.closeTab,
    icon: <CloseIcon />,
    onSelect: () => {
      useSessions.getState().activate(tab.id);
      closeActiveTab();
    },
  });
  return items;
}

function TabItem({ item, activeId }: { item: StripItem; activeId: string | null }) {
  const tab = item.kind === 'tab' ? item.tab : item.focus;
  const members = item.kind === 'tab' ? [item.tab] : item.members;
  const active = members.some((m) => m.id === activeId);
  const state = item.kind === 'tab' ? tab.state : worstState(members);
  const { activate, rename, reorder } = useSessions();
  const [editing, setEditing] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const platform = useUi((u) => u.platform);

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={stateLabel(tab)}
      aria-label={
        item.kind === 'group' ? t.terminal.group.label(tab.title, members.length - 1) : undefined
      }
      data-group={item.kind === 'group' ? '' : undefined}
      className={`${s.tab} ${active ? s.tabActive : ''} ${dropTarget ? s.dropBefore : ''} no-drag`}
      draggable={!editing}
      onClick={() => {
        activate(tab.id);
        useWorkspace.getState().setView('terminal');
      }}
      onDoubleClick={() => {
        setEditing(true);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        activate(tab.id);
        setMenuAt({ x: e.clientX, y: e.clientY });
      }}
      onAuxClick={(e) => {
        if (e.button === 1) void closeTab(tab.id);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-shellvault-tab', tab.id);
        e.dataTransfer.effectAllowed = 'move';
        startDrag({
          id: tab.id,
          kind: item.kind === 'group' ? 'group' : tab.kind === 'sftp' ? 'sftp' : 'session',
          fromPane: false,
        });
      }}
      onDragEnd={endDrag}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-shellvault-tab')) {
          e.preventDefault();
          setDropTarget(true);
        }
      }}
      onDragLeave={() => {
        setDropTarget(false);
      }}
      onDrop={(e) => {
        setDropTarget(false);
        const id = e.dataTransfer.getData('application/x-shellvault-tab');
        if (id) reorder(id, tab.id);
      }}
    >
      <StateIcon state={state} />
      {editing ? (
        <input
          className={s.tabRename}
          defaultValue={tab.title}
          aria-label={t.terminal.renameTab}
          autoFocus
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          onBlur={(e) => {
            rename(tab.id, e.currentTarget.value);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className={s.tabTitle}>{tab.title}</span>
      )}
      {item.kind === 'group' && (
        <span className={s.groupCount} aria-hidden>
          {members.length}
        </span>
      )}
      <Button
        variant="ghost"
        iconOnly
        className={s.tabClose}
        aria-label={`${t.terminal.closeTab} ${tab.title}`}
        onClick={(e) => {
          e.stopPropagation();
          void closeTab(tab.id);
        }}
      >
        <CloseIcon width={12} height={12} />
      </Button>
      {menuAt && (
        <Menu
          anchor={menuAt}
          items={tabMenu(tab, platform, () => {
            setEditing(true);
          })}
          onClose={() => {
            setMenuAt(null);
          }}
        />
      )}
    </div>
  );
}

export interface TabBarProps {
  /** Itens do menu "+" (ex.: terminal local); vazio esconde o botão. */
  newTabItems: MenuItem[];
  trailing?: ReactNode;
}

/** Distância da borda (px) em que arrastar uma aba rola a barra, e o passo de cada evento. */
const EDGE = 48;
const EDGE_STEP = 14;

function revealActive(bar: HTMLElement | null) {
  bar
    ?.querySelector<HTMLElement>('[aria-selected="true"]')
    ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Rolagem horizontal da barra: o que sobra de cada lado e a aba ativa sempre à vista. */
function useTabScroll(barRef: RefObject<HTMLDivElement | null>, activeId: string | null) {
  const [overflow, setOverflow] = useState({ start: false, end: false });

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const max = bar.scrollWidth - bar.clientWidth;
      const start = bar.scrollLeft > 1;
      const end = bar.scrollLeft < max - 1;
      setOverflow((cur) => (cur.start === start && cur.end === end ? cur : { start, end }));
    };
    measure();
    // A roda vertical do mouse, em qualquer ponto da faixa (setas inclusive), rola as abas na
    // horizontal; precisa de listener não passivo.
    const strip = bar.parentElement ?? bar;
    const onWheel = (e: WheelEvent) => {
      if (bar.scrollWidth <= bar.clientWidth) return;
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      bar.scrollLeft += e.deltaMode === WheelEvent.DOM_DELTA_LINE ? delta * 32 : delta;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    for (const child of Array.from(bar.children)) observer.observe(child);
    bar.addEventListener('scroll', measure, { passive: true });
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      bar.removeEventListener('scroll', measure);
      strip.removeEventListener('wheel', onWheel);
    };
  });

  // Atalho, nova sessão ou a lista de abas: a ativa sempre fica visível.
  useEffect(() => {
    revealActive(barRef.current);
  }, [barRef, activeId]);

  return overflow;
}

/** Arrastar com o botão esquerdo no fundo da barra desliza as abas. */
function startPan(bar: HTMLDivElement, e: ReactPointerEvent) {
  if (e.button !== 0 || e.target !== bar) return;
  const startX = e.clientX;
  const startScroll = bar.scrollLeft;
  bar.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    bar.scrollLeft = startScroll - (ev.clientX - startX);
  };
  const end = () => {
    bar.removeEventListener('pointermove', move);
    bar.removeEventListener('pointerup', end);
    bar.removeEventListener('pointercancel', end);
  };
  bar.addEventListener('pointermove', move);
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
}

function scrollByPage(bar: HTMLDivElement | null, dir: -1 | 1) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  bar?.scrollBy({ left: dir * bar.clientWidth * 0.8, behavior: reduce ? 'auto' : 'smooth' });
}

export function TabBar({ newTabItems, trailing }: TabBarProps) {
  const { tabs, groups, activeId, activate, reorder } = useSessions();
  const items = stripItems(tabs, groups);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [listAnchor, setListAnchor] = useState<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Ordem e títulos mudam a posição da aba ativa sem trocar o id: entram na chave.
  const layoutKey = `${activeId ?? ''}|${items.map((it) => `${it.id}:${it.kind === 'tab' ? it.tab.title : `${it.focus.title}+${String(it.members.length)}`}`).join('|')}`;
  const indicator = useSlidingIndicator(barRef, layoutKey, 'x');
  const overflow = useTabScroll(barRef, activeId);
  const overflowing = overflow.start || overflow.end;

  return (
    <div className={s.tabStrip}>
      {overflowing && (
        <Button
          variant="ghost"
          iconOnly
          className={`${s.tabScroll} no-drag`}
          aria-label={t.terminal.scrollTabsLeft}
          disabled={!overflow.start}
          onClick={() => {
            scrollByPage(barRef.current, -1);
          }}
        >
          <ChevronLeftIcon />
        </Button>
      )}
      <div
        ref={barRef}
        className={s.tabBar}
        role="tablist"
        style={indicator ?? undefined}
        data-indicator={indicator ? '' : undefined}
        data-fade-start={overflow.start ? '' : undefined}
        data-fade-end={overflow.end ? '' : undefined}
        onPointerDown={(e) => {
          startPan(e.currentTarget, e);
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('application/x-shellvault-tab')) return;
          e.preventDefault();
          // Levar a aba até a borda rola a barra e mostra as que estão escondidas.
          const box = e.currentTarget.getBoundingClientRect();
          if (e.clientX < box.left + EDGE) e.currentTarget.scrollLeft -= EDGE_STEP;
          else if (e.clientX > box.right - EDGE) e.currentTarget.scrollLeft += EDGE_STEP;
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData('application/x-shellvault-tab');
          if (id && e.target === e.currentTarget) reorder(id, null);
        }}
      >
        {items.map((item) => (
          <TabItem key={item.id} item={item} activeId={activeId} />
        ))}
      </div>
      {overflowing && (
        <>
          <Button
            variant="ghost"
            iconOnly
            className={`${s.tabScroll} no-drag`}
            aria-label={t.terminal.scrollTabsRight}
            disabled={!overflow.end}
            onClick={() => {
              scrollByPage(barRef.current, 1);
            }}
          >
            <ChevronIcon />
          </Button>
          <Button
            variant="ghost"
            iconOnly
            className={`${s.tabScroll} no-drag`}
            aria-label={t.terminal.allTabs}
            aria-haspopup="menu"
            aria-expanded={listAnchor !== null}
            onClick={(e) => {
              const el = e.currentTarget;
              setListAnchor((cur) => (cur ? null : el));
            }}
          >
            <ChevronDownIcon />
          </Button>
        </>
      )}
      {newTabItems.length > 0 && (
        <Button
          variant="ghost"
          iconOnly
          className={`${s.newTab} no-drag`}
          aria-label={t.terminal.newLocal}
          aria-haspopup="menu"
          aria-expanded={menuAnchor !== null}
          onClick={(e) => {
            const el = e.currentTarget;
            setMenuAnchor((cur) => (cur ? null : el));
          }}
        >
          <PlusIcon />
        </Button>
      )}
      {trailing}
      {menuAnchor && (
        <Menu
          anchor={menuAnchor}
          items={newTabItems}
          onClose={() => {
            setMenuAnchor(null);
          }}
        />
      )}
      {listAnchor && (
        <Menu
          anchor={listAnchor}
          items={items.map((item) => ({
            label:
              item.kind === 'tab'
                ? item.tab.title
                : t.terminal.group.label(item.focus.title, item.members.length - 1),
            icon: (
              <StateIcon state={item.kind === 'tab' ? item.tab.state : worstState(item.members)} />
            ),
            onSelect: () => {
              activate(item.kind === 'tab' ? item.id : item.focus.id);
              useWorkspace.getState().setView('terminal');
              // Já ativa, a aba não muda o id e o efeito não roda: revela depois do render.
              requestAnimationFrame(() => {
                revealActive(barRef.current);
              });
            },
          }))}
          onClose={() => {
            setListAnchor(null);
          }}
        />
      )}
    </div>
  );
}

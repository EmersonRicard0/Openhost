import { useState, type ReactNode } from 'react';
import { t } from '../../i18n/pt-BR';
import { closeTab, useSessions, type Tab } from '../../stores/sessions';
import { Button } from '../../ui/Button';
import { CloseIcon, PlusIcon } from '../../ui/icons';
import { Menu, type MenuItem } from '../../ui/Menu';
import s from './terminal.module.css';

function stateLabel(tab: Tab): string {
  switch (tab.state) {
    case 'connected':
    case 'running':
      return tab.title;
    case 'disconnected':
      return `${tab.title} — ${t.terminal.disconnected}`;
    case 'exited':
      return `${tab.title} — ${t.terminal.exited(tab.exitCode)}`;
    default:
      return `${tab.title} — ${t.terminal.connecting}`;
  }
}

function TabItem({ tab, active }: { tab: Tab; active: boolean }) {
  const { activate, rename, reorder } = useSessions();
  const [editing, setEditing] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      title={stateLabel(tab)}
      className={`${s.tab} ${active ? s.tabActive : ''} ${dropTarget ? s.dropBefore : ''} no-drag`}
      draggable={!editing}
      onClick={() => {
        activate(tab.id);
      }}
      onDoubleClick={() => {
        setEditing(true);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) void closeTab(tab.id);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-shellvault-tab', tab.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
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
      <span className={s.dot} data-state={tab.state} />
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
    </div>
  );
}

export interface TabBarProps {
  /** Itens do menu "+" (ex.: terminal local); vazio esconde o botão. */
  newTabItems: MenuItem[];
  trailing?: ReactNode;
}

export function TabBar({ newTabItems, trailing }: TabBarProps) {
  const { tabs, activeId, reorder } = useSessions();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className={s.tabBar}
      role="tablist"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-shellvault-tab')) e.preventDefault();
      }}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('application/x-shellvault-tab');
        if (id && e.target === e.currentTarget) reorder(id, null);
      }}
    >
      {tabs.map((tab) => (
        <TabItem key={tab.id} tab={tab} active={tab.id === activeId} />
      ))}
      {newTabItems.length > 0 && (
        <Button
          variant="ghost"
          iconOnly
          className={`${s.newTab} no-drag`}
          aria-label={t.terminal.newLocal}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <PlusIcon />
        </Button>
      )}
      {trailing}
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          items={newTabItems}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}

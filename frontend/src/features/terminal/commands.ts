// Ações do espaço de trabalho usadas pelos atalhos (FR-140) e pela paleta (FR-141).
import type { ShortcutAction } from '../../app/shortcuts';
import {
  closeTab,
  groupOf,
  isLive,
  stripItems,
  useSessions,
  type Tab,
} from '../../stores/sessions';
import { useShells } from '../../stores/shells';
import { useUi } from '../../stores/ui';
import { useWorkspace } from '../../stores/workspace';
import { toastError } from '../../ui/Toast';
import { leaves, neighbor, type Side } from './layout';
import { openLocal } from './openLocal';

/** Com a aba "Configurações" à frente, nenhuma sessão recebe atalhos de terminal (FR-909). */
function activeTab() {
  if (useWorkspace.getState().view === 'settings') return null;
  const { tabs, activeId } = useSessions.getState();
  return tabs.find((tab) => tab.id === activeId) ?? null;
}

/** Aba ativa com terminal (busca e zoom não valem para SFTP). */
export function activeTerminalId(): string | null {
  const tab = activeTab();
  return tab && tab.kind !== 'sftp' ? tab.id : null;
}

export function openSearch(): void {
  const id = activeTerminalId();
  if (!id) return;
  const workspace = useWorkspace.getState();
  if (workspace.searchFor === id) {
    // Já aberta: só volta o foco para o campo.
    document.querySelector<HTMLInputElement>(`[data-search-for="${id}"] input`)?.select();
    return;
  }
  workspace.setSearchFor(id);
}

/** Fecha a sessão; conexão SSH/SFTP ativa pede confirmação antes. */
export function closeSession(id: string): void {
  const tab = useSessions.getState().tabs.find((tb) => tb.id === id);
  if (!tab) return;
  if (needsConfirmClose(tab)) useWorkspace.getState().setConfirmClose(tab.id);
  else void closeTab(tab.id);
}

/** Conexões que pedem confirmação ao fechar: SSH/SFTP ativas. */
const needsConfirmClose = (tab: Tab) => tab.kind !== 'local' && isLive(tab.state);

/** Fecha todas as sessões de um grupo, com uma confirmação só quando há conexão ativa (FR-613). */
export function closeGroup(groupId: string): void {
  const { groups, tabs } = useSessions.getState();
  const group = groups[groupId];
  if (!group) return;
  const members = leaves(group.root);
  if (tabs.some((tab) => members.includes(tab.id) && needsConfirmClose(tab)))
    useWorkspace.getState().setConfirmClose(groupId);
  else for (const id of members) void closeTab(id);
}

/** Fecha a aba ativa (num grupo, o painel ativo); com as Configurações à frente, fecha elas. */
export function closeActiveTab(): void {
  if (useWorkspace.getState().view === 'settings') {
    useWorkspace.getState().closeSettings();
    return;
  }
  const tab = activeTab();
  if (tab) closeSession(tab.id);
}

/** Próxima aba da barra; um grupo conta como uma aba e abre no painel que tinha o foco. */
export function cycleTab(step: 1 | -1): void {
  const { tabs, groups, activeId, activate } = useSessions.getState();
  const items = stripItems(tabs, groups);
  if (items.length < 2) return;
  const index = items.findIndex((item) =>
    item.kind === 'tab' ? item.id === activeId : item.members.some((m) => m.id === activeId),
  );
  const next = items[(index + step + items.length) % items.length];
  if (next) activate(next.kind === 'tab' ? next.id : next.focus.id);
}

/** Painel vizinho do ativo na direção pedida, dentro do grupo (FR-607). */
export function focusDir(side: Side): void {
  if (useWorkspace.getState().view === 'settings') return;
  const { groups, activeId, activate } = useSessions.getState();
  const group = activeId ? groupOf(groups, activeId) : undefined;
  if (!group || !activeId) return;
  const next = neighbor(group.root, activeId, side);
  if (next) activate(next);
}

function zoom(delta: number | null): void {
  const id = activeTerminalId();
  const base = useUi.getState().settings?.terminalFontSize ?? 14;
  if (!id) return;
  if (delta === null) useWorkspace.getState().zoomReset(id);
  else useWorkspace.getState().zoomBy(id, delta, base);
}

export async function toggleTheme(): Promise<void> {
  const res = await window.shellvault.app.updateUiSettings({
    theme: useUi.getState().dark ? 'light' : 'dark',
  });
  if (res.ok) useUi.getState().setSettings(res.value);
  else toastError(res.error);
}

/** Recolhe ou expande a barra lateral (FR-167); a interface muda antes de salvar. */
export function toggleSidebar(): void {
  const ui = useUi.getState();
  if (!ui.settings) return;
  const sidebarCollapsed = !ui.settings.sidebarCollapsed;
  ui.setSettings({ ...ui.settings, sidebarCollapsed });
  void window.shellvault.app.updateUiSettings({ sidebarCollapsed }).then((res) => {
    if (!res.ok) toastError(res.error);
  });
}

/** Algum diálogo (que não a paleta) está aberto: atalhos ficam parados. */
function dialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]:not([data-palette])') !== null;
}

export function runShortcut(action: ShortcutAction, repeat: boolean): void {
  const workspace = useWorkspace.getState();
  if (action === 'palette') {
    if (!repeat && !dialogOpen()) workspace.setPaletteOpen(!workspace.paletteOpen);
    return;
  }
  if (dialogOpen() || workspace.paletteOpen) return;
  switch (action) {
    case 'newTab':
      if (!repeat)
        void openLocal(
          useUi.getState().settings?.defaultShell ??
            useShells.getState().shells[0]?.id ??
            'powershell',
        );
      break;
    case 'newPowerShell':
      if (!repeat) void openLocal('powershell');
      break;
    case 'closeTab':
      if (!repeat) closeActiveTab();
      break;
    case 'nextTab':
      cycleTab(1);
      break;
    case 'prevTab':
      cycleTab(-1);
      break;
    case 'search':
      openSearch();
      break;
    case 'toggleSidebar':
      if (!repeat) toggleSidebar();
      break;
    case 'openSettings':
      if (!repeat) workspace.setView('settings');
      break;
    case 'zoomIn':
      zoom(1);
      break;
    case 'zoomOut':
      zoom(-1);
      break;
    case 'zoomReset':
      zoom(null);
      break;
    case 'focusLeft':
      focusDir('left');
      break;
    case 'focusRight':
      focusDir('right');
      break;
    case 'focusUp':
      focusDir('top');
      break;
    case 'focusDown':
      focusDir('bottom');
      break;
  }
}

// Abas abertas (FR-012). O estado real de cada sessão vive no processo principal.
import { create } from 'zustand';
import type { LocalShell, SessionKind, SessionState } from '@shared/model/types';
import { forget } from '../features/terminal/dataBus';
import {
  insert,
  leaf,
  leaves,
  MAX_PANES,
  move,
  remove,
  type LayoutNode,
  type Side,
} from '../features/terminal/layout';
import { dropInteractions } from './interactions';

export interface Tab {
  id: string;
  kind: SessionKind;
  title: string;
  hostId: string | null;
  shell: LocalShell | null;
  state: SessionState;
  reason: string | null;
  exitCode: number | null;
  /** RTT do keepalive SSH (FR-172); null antes da primeira medição e em shells locais. */
  latencyMs: number | null;
}

/** Até 4 sessões de terminal na mesma aba (specs/006). Só em memória. */
export interface Group {
  id: string;
  root: LayoutNode;
  /** Painel que recebe o foco quando a aba do grupo é ativada. */
  focusId: string;
}

/** Item da barra de abas: sessão avulsa ou grupo, na posição do seu primeiro membro. */
export type StripItem =
  | { kind: 'tab'; id: string; tab: Tab }
  | { kind: 'group'; id: string; group: Group; members: Tab[]; focus: Tab };

interface SessionsState {
  tabs: Tab[];
  /** Sessão com o teclado; num grupo, o painel ativo. */
  activeId: string | null;
  groups: Record<string, Group>;
  add: (tab: Omit<Tab, 'reason' | 'exitCode' | 'latencyMs'>) => void;
  setState: (
    id: string,
    state: SessionState,
    reason: string | null,
    exitCode: number | null,
    latencyMs?: number | null,
  ) => void;
  rename: (id: string, title: string) => void;
  /** Move a aba `id` para a posição de `beforeId` (ou para o fim). */
  reorder: (id: string, beforeId: string | null) => void;
  close: (id: string) => void;
  activate: (id: string) => void;
  /** Junta `dragId` ao lado de `targetId`; dentro do mesmo grupo, reorganiza. */
  join: (dragId: string, targetId: string, side: Side) => void;
  /** Tira a sessão do grupo e a devolve a uma aba logo depois dele. */
  splitOut: (id: string) => void;
  /** Troca a árvore de um grupo (proporções das divisórias). */
  setLayout: (groupId: string, root: LayoutNode) => void;
}

export function groupOf(groups: Record<string, Group>, sessionId: string): Group | undefined {
  return Object.values(groups).find((g) => leaves(g.root).includes(sessionId));
}

export function stripItems(tabs: Tab[], groups: Record<string, Group>): StripItem[] {
  const byId = new Map(tabs.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const items: StripItem[] = [];
  for (const tab of tabs) {
    const group = groupOf(groups, tab.id);
    if (!group) {
      items.push({ kind: 'tab', id: tab.id, tab });
      continue;
    }
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    const members = leaves(group.root)
      .map((id) => byId.get(id))
      .filter((t): t is Tab => t !== undefined);
    const focus = byId.get(group.focusId) ?? members[0];
    if (focus) items.push({ kind: 'group', id: group.id, group, members, focus });
  }
  return items;
}

/** Tira `id` do grupo em que estiver; desfaz o grupo que ficar com uma sessão. */
function withoutMember(groups: Record<string, Group>, id: string): Record<string, Group> {
  const group = groupOf(groups, id);
  if (!group) return groups;
  const root = remove(group.root, id);
  if (!root || root.kind === 'leaf') {
    return Object.fromEntries(Object.entries(groups).filter(([key]) => key !== group.id));
  }
  const rest = leaves(root);
  return {
    ...groups,
    [group.id]: {
      ...group,
      root,
      focusId: rest.includes(group.focusId) ? group.focusId : (rest[0] ?? ''),
    },
  };
}

/** Move a aba `id` para logo depois do último membro (na ordem das abas) de `members`. */
function placeAfter(tabs: Tab[], id: string, members: string[]): Tab[] {
  const moving = tabs.find((t) => t.id === id);
  if (!moving) return tabs;
  const rest = tabs.filter((t) => t.id !== id);
  let index = -1;
  rest.forEach((t, i) => {
    if (members.includes(t.id)) index = i;
  });
  rest.splice(index + 1, 0, moving);
  return rest;
}

let nextGroup = 0;

export const useSessions = create<SessionsState>((set, get) => ({
  tabs: [],
  activeId: null,
  groups: {},
  add(tab) {
    set({
      tabs: [...get().tabs, { ...tab, reason: null, exitCode: null, latencyMs: null }],
      activeId: tab.id,
    });
  },
  setState(id, state, reason, exitCode, latencyMs = null) {
    set({
      tabs: get().tabs.map((t) => (t.id === id ? { ...t, state, reason, exitCode, latencyMs } : t)),
    });
  },
  rename(id, title) {
    const clean = title.trim();
    if (!clean) return;
    set({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, title: clean.slice(0, 100) } : t)) });
  },
  reorder(id, beforeId) {
    const tabs = get().tabs;
    const moving = tabs.find((t) => t.id === id);
    if (!moving || id === beforeId) return;
    const rest = tabs.filter((t) => t.id !== id);
    const index = beforeId === null ? rest.length : rest.findIndex((t) => t.id === beforeId);
    rest.splice(index < 0 ? rest.length : index, 0, moving);
    set({ tabs: rest });
  },
  close(id) {
    const { tabs, activeId, groups } = get();
    const index = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    const group = groupOf(groups, id);
    const nextGroups = withoutMember(groups, id);
    let nextActive = activeId;
    if (activeId === id) {
      // Num grupo, o foco fica no próprio grupo; senão vai para a aba vizinha.
      const left = group ? remove(group.root, id) : null;
      const remaining = group
        ? (nextGroups[group.id]?.focusId ?? (left ? leaves(left)[0] : undefined))
        : undefined;
      nextActive = remaining ?? next[Math.min(index, next.length - 1)]?.id ?? null;
    }
    set({ tabs: next, groups: nextGroups, activeId: nextActive });
  },
  activate(id) {
    const { groups } = get();
    const group = groupOf(groups, id);
    set({
      activeId: id,
      groups:
        group && group.focusId !== id
          ? { ...groups, [group.id]: { ...group, focusId: id } }
          : groups,
    });
  },
  join(dragId, targetId, side) {
    const { tabs, groups } = get();
    if (dragId === targetId) return;
    const drag = tabs.find((t) => t.id === dragId);
    const target = tabs.find((t) => t.id === targetId);
    if (!drag || !target || drag.kind === 'sftp' || target.kind === 'sftp') return;
    const targetGroup = groupOf(groups, targetId);
    if (targetGroup && targetGroup === groupOf(groups, dragId)) {
      const root = move(targetGroup.root, dragId, targetId, side);
      set({
        groups: { ...groups, [targetGroup.id]: { ...targetGroup, root, focusId: dragId } },
        activeId: dragId,
      });
      return;
    }
    if (targetGroup && leaves(targetGroup.root).length >= MAX_PANES) return;
    // Vindo de outro grupo, sai de lá primeiro.
    const base = withoutMember(groups, dragId);
    const current = targetGroup ? (base[targetGroup.id] ?? targetGroup) : undefined;
    const group: Group = current
      ? { ...current, root: insert(current.root, targetId, side, dragId), focusId: dragId }
      : {
          id: `g${String(++nextGroup)}`,
          root: insert(leaf(targetId), targetId, side, dragId),
          focusId: dragId,
        };
    const members = leaves(group.root).filter((m) => m !== dragId);
    set({
      tabs: placeAfter(tabs, dragId, members),
      groups: { ...base, [group.id]: group },
      activeId: dragId,
    });
  },
  splitOut(id) {
    const { tabs, groups } = get();
    const group = groupOf(groups, id);
    if (!group) return;
    const members = leaves(group.root).filter((m) => m !== id);
    set({ tabs: placeAfter(tabs, id, members), groups: withoutMember(groups, id), activeId: id });
  },
  setLayout(groupId, root) {
    const { groups } = get();
    const group = groups[groupId];
    if (group) set({ groups: { ...groups, [groupId]: { ...group, root } } });
  },
}));

let subscribed = false;

export function subscribeSessions(): void {
  if (subscribed) return;
  subscribed = true;
  window.shellvault.sessions.onState((e) => {
    useSessions
      .getState()
      .setState(e.sessionId, e.state, e.reason, e.exitCode, e.latencyMs ?? null);
  });
}

export async function closeTab(id: string): Promise<void> {
  useSessions.getState().close(id);
  dropInteractions(id);
  forget(id);
  await window.shellvault.sessions.close(id);
}

export function isLive(state: SessionState): boolean {
  return state !== 'disconnected' && state !== 'error' && state !== 'closed';
}

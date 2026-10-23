// Regras de Group (data-model.md, "Group"). Funções operam sobre o rascunho do cofre.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Group } from '@shared/model/types';
import { fail } from '../ipc/messages';
import type { VaultContent } from '../vault/content';
import type { ReadonlyVaultContent } from '../vault/store';

const groupName = z.string().trim().min(1).max(100);

function parseName(name: string): string {
  const parsed = groupName.safeParse(name);
  if (!parsed.success) throw fail('INVALID_INPUT');
  return parsed.data;
}

export function findGroup(content: ReadonlyVaultContent, id: string): Group {
  const group = content.groups.find((g) => g.id === id);
  if (!group) throw fail('NOT_FOUND');
  return group;
}

function requireParent(content: ReadonlyVaultContent, parentId: string | null): void {
  if (parentId !== null && !content.groups.some((g) => g.id === parentId)) {
    throw fail('INVALID_INPUT');
  }
}

/** Próxima posição no fim dos irmãos. */
function nextSortOrder(content: ReadonlyVaultContent, parentId: string | null): number {
  let max = -1;
  for (const g of content.groups) if (g.parentId === parentId) max = Math.max(max, g.sortOrder);
  return max + 1;
}

/** Verdadeiro se `candidate` é `ancestorId` ou está abaixo dele. */
function isSelfOrDescendant(
  content: ReadonlyVaultContent,
  ancestorId: string,
  candidate: string | null,
): boolean {
  const seen = new Set<string>();
  let current = candidate;
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = content.groups.find((g) => g.id === current)?.parentId ?? null;
  }
  return false;
}

export function listGroups(content: ReadonlyVaultContent): Group[] {
  return content.groups.map((g) => ({ ...g }));
}

export function createGroup(content: VaultContent, name: string, parentId: string | null): Group {
  const clean = parseName(name);
  requireParent(content, parentId);
  const group: Group = {
    id: randomUUID(),
    name: clean,
    parentId,
    sortOrder: nextSortOrder(content, parentId),
  };
  content.groups.push(group);
  return group;
}

export function renameGroup(content: VaultContent, id: string, name: string): Group {
  const clean = parseName(name);
  const group = findGroup(content, id);
  group.name = clean;
  return { ...group };
}

export function moveGroup(content: VaultContent, id: string, parentId: string | null): void {
  const group = findGroup(content, id);
  if (isSelfOrDescendant(content, id, parentId)) throw fail('GROUP_CYCLE');
  requireParent(content, parentId);
  if (group.parentId === parentId) return;
  group.sortOrder = nextSortOrder(content, parentId);
  group.parentId = parentId;
}

/** Hosts e subgrupos diretos sobem para a raiz; não há exclusão em cascata (US3-4). */
export function removeGroup(content: VaultContent, id: string): void {
  findGroup(content, id);
  let order = nextSortOrder(content, null);
  for (const g of content.groups) {
    if (g.parentId === id) {
      g.parentId = null;
      g.sortOrder = order++;
    }
  }
  for (const h of content.hosts) if (h.groupId === id) h.groupId = null;
  content.groups = content.groups.filter((g) => g.id !== id);
}

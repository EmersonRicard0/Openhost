import { z } from 'zod';
import type { MainContext } from '../context';
import {
  createGroup,
  findGroup,
  listGroups,
  moveGroup,
  removeGroup,
  renameGroup,
} from '../domain/groups';
import { id } from './schemas';

export function registerGroupHandlers(ctx: MainContext): void {
  const { reg, vault } = ctx;
  const locked = { requiresUnlocked: true };
  const name = z.string().max(1000);

  reg.handle('groups', 'list', z.tuple([]), () => listGroups(vault.read()), locked);

  reg.handle(
    'groups',
    'create',
    z.tuple([name, id.nullable()]),
    (groupName, parentId) => vault.mutate((c) => createGroup(c, groupName, parentId)),
    locked,
  );

  reg.handle(
    'groups',
    'rename',
    z.tuple([id, name]),
    (groupId, groupName) => vault.mutate((c) => renameGroup(c, groupId, groupName)),
    locked,
  );

  reg.handle(
    'groups',
    'move',
    z.tuple([id, id.nullable()]),
    async (groupId, parentId) => {
      await vault.mutate((c) => {
        moveGroup(c, groupId, parentId);
      });
    },
    locked,
  );

  reg.handle(
    'groups',
    'remove',
    z.tuple([id]),
    async (groupId) => {
      findGroup(vault.read(), groupId);
      await vault.mutate((c) => {
        removeGroup(c, groupId);
      });
    },
    locked,
  );
}

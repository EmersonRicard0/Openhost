import { z } from 'zod';
import type { HostInput } from '@shared/model/types';
import type { MainContext } from '../context';
import {
  createHost,
  duplicateHost,
  findHost,
  listHostViews,
  moveHost,
  removeHost,
  toHostView,
  updateHost,
} from '../domain/hosts';
import { id } from './schemas';

// Forma bruta; as regras finas ficam no domínio (hostInputSchema).
const hostInput = z.object({
  label: z.string(),
  address: z.string(),
  port: z.number(),
  username: z.string(),
  authMethod: z.enum(['password', 'key', 'ask']),
  credentialId: id.nullable(),
  groupId: id.nullable(),
}) satisfies z.ZodType<HostInput>;

export function registerHostHandlers(ctx: MainContext): void {
  const { reg, vault, forwards } = ctx;
  const locked = { requiresUnlocked: true };
  const now = () => new Date().toISOString();

  reg.handle('hosts', 'list', z.tuple([]), () => listHostViews(vault.read()), locked);

  reg.handle(
    'hosts',
    'create',
    z.tuple([hostInput]),
    async (input) => {
      const host = await vault.mutate((c) => createHost(c, input, now()));
      return toHostView(vault.read(), host);
    },
    locked,
  );

  reg.handle(
    'hosts',
    'update',
    z.tuple([id, hostInput]),
    async (hostId, input) => {
      const host = await vault.mutate((c) => updateHost(c, hostId, input, now()));
      return toHostView(vault.read(), host);
    },
    locked,
  );

  reg.handle(
    'hosts',
    'remove',
    z.tuple([id]),
    async (hostId) => {
      const content = vault.read();
      findHost(content, hostId);
      // Regras do host somem junto: as ativas são desligadas antes.
      for (const r of content.forwardRules) if (r.hostId === hostId) forwards.deactivate(r.id);
      await vault.mutate((c) => {
        removeHost(c, hostId);
      });
    },
    locked,
  );

  reg.handle(
    'hosts',
    'duplicate',
    z.tuple([id]),
    async (hostId) => {
      const host = await vault.mutate((c) => duplicateHost(c, hostId, now()));
      return toHostView(vault.read(), host);
    },
    locked,
  );

  reg.handle(
    'hosts',
    'move',
    z.tuple([id, id.nullable()]),
    async (hostId, groupId) => {
      await vault.mutate((c) => {
        moveHost(c, hostId, groupId, now());
      });
    },
    locked,
  );
}

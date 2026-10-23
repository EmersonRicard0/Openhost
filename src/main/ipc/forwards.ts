import { z } from 'zod';
import type { ForwardRuleInput } from '@shared/model/types';
import type { MainContext } from '../context';
import { createRule, findRule, listForHost, removeRule, updateRule } from '../domain/forwardRules';
import { findHost } from '../domain/hosts';
import { id } from './schemas';

// Forma bruta; as regras finas ficam no domínio.
const ruleInput = z.object({
  hostId: id,
  label: z.string().max(1000).nullable(),
  bindAddress: z.string().max(1000),
  allowNonLoopback: z.boolean(),
  bindPort: z.number(),
  destHost: z.string().max(1000),
  destPort: z.number(),
}) satisfies z.ZodType<ForwardRuleInput>;

export function registerForwardHandlers(ctx: MainContext): void {
  const { reg, vault, forwards } = ctx;
  const locked = { requiresUnlocked: true };

  reg.handle(
    'forwards',
    'list',
    z.tuple([id]),
    (hostId) => {
      const content = vault.read();
      findHost(content, hostId);
      return listForHost(content, hostId).map((r) => ({ ...r, ...forwards.status(r.id) }));
    },
    locked,
  );

  // Sem 🔒: encaminhamentos abertos continuam visíveis com o cofre bloqueado (FR-003).
  reg.handle('forwards', 'listActive', z.tuple([]), () => forwards.listActive());

  reg.handle(
    'forwards',
    'create',
    z.tuple([ruleInput]),
    (input) => vault.mutate((c) => createRule(c, input)),
    locked,
  );

  reg.handle(
    'forwards',
    'update',
    z.tuple([id, ruleInput]),
    async (ruleId, input) => {
      findRule(vault.read(), ruleId);
      // A regra ativa é desligada para a mudança valer na próxima ativação.
      forwards.deactivate(ruleId);
      return vault.mutate((c) => updateRule(c, ruleId, input));
    },
    locked,
  );

  reg.handle(
    'forwards',
    'remove',
    z.tuple([id]),
    async (ruleId) => {
      findRule(vault.read(), ruleId);
      forwards.deactivate(ruleId);
      await vault.mutate((c) => {
        removeRule(c, ruleId);
      });
    },
    locked,
  );

  reg.handle('forwards', 'activate', z.tuple([id]), (ruleId) => forwards.activate(ruleId), locked);

  reg.handle('forwards', 'deactivate', z.tuple([id]), (ruleId) => {
    forwards.deactivate(ruleId);
  });
}

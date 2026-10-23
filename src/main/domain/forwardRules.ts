// Regras de ForwardRule (data-model.md, "ForwardRule"). Funções operam sobre o rascunho do cofre.
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import type { ForwardRule, ForwardRuleInput } from '@shared/model/types';
import { fail } from '../ipc/messages';
import type { VaultContent } from '../vault/content';
import type { ReadonlyVaultContent } from '../vault/store';
import { isValidAddress, normalizeAddress } from './hosts';

export const DEFAULT_BIND_ADDRESS = '127.0.0.1';

const port = z.number().int().min(1).max(65535);

const ruleSchema = z.object({
  hostId: z.uuid(),
  label: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .transform((v) => (v ? v : null)),
  bindAddress: z
    .string()
    .trim()
    .max(255)
    .transform((v) => (v === '' ? DEFAULT_BIND_ADDRESS : normalizeAddress(v)))
    .refine((v) => v === 'localhost' || isIP(v) !== 0, 'endereço local inválido'),
  allowNonLoopback: z.boolean(),
  bindPort: port,
  destHost: z.string().trim().min(1).max(255).transform(normalizeAddress).refine(isValidAddress),
  destPort: port,
});

/** Só escuta na própria máquina: 127.0.0.0/8, ::1 ou localhost. */
export function isLoopback(address: string): boolean {
  return address === 'localhost' || address === '::1' || /^127\.\d+\.\d+\.\d+$/.test(address);
}

function validate(
  content: ReadonlyVaultContent,
  input: ForwardRuleInput,
  selfId: string | null,
): ForwardRuleInput {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) throw fail('INVALID_INPUT');
  const rule = parsed.data;
  if (!content.hosts.some((h) => h.id === rule.hostId)) throw fail('INVALID_INPUT');
  // Escutar fora do loopback expõe a porta à rede: exige confirmação explícita (FR-025).
  if (!isLoopback(rule.bindAddress) && !rule.allowNonLoopback) throw fail('INVALID_INPUT');
  const taken = content.forwardRules.some(
    (r) => r.id !== selfId && r.bindAddress === rule.bindAddress && r.bindPort === rule.bindPort,
  );
  if (taken) throw fail('INVALID_INPUT');
  return rule;
}

export function findRule(content: ReadonlyVaultContent, id: string): ForwardRule {
  const rule = content.forwardRules.find((r) => r.id === id);
  if (!rule) throw fail('NOT_FOUND');
  return rule;
}

export function listForHost(content: ReadonlyVaultContent, hostId: string): ForwardRule[] {
  return content.forwardRules.filter((r) => r.hostId === hostId).map((r) => ({ ...r }));
}

export function createRule(content: VaultContent, input: ForwardRuleInput): ForwardRule {
  const rule: ForwardRule = { ...validate(content, input, null), id: randomUUID() };
  content.forwardRules.push(rule);
  return rule;
}

export function updateRule(
  content: VaultContent,
  id: string,
  input: ForwardRuleInput,
): ForwardRule {
  const index = content.forwardRules.findIndex((r) => r.id === id);
  if (index < 0) throw fail('NOT_FOUND');
  const rule: ForwardRule = { ...validate(content, input, id), id };
  content.forwardRules[index] = rule;
  return rule;
}

export function removeRule(content: VaultContent, id: string): void {
  findRule(content, id);
  content.forwardRules = content.forwardRules.filter((r) => r.id !== id);
}

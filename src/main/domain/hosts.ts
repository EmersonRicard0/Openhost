// Regras de Host (data-model.md, "Host"). Funções operam sobre o rascunho do cofre.
import { isIP } from 'node:net';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Host, HostInput, HostView } from '@shared/model/types';
import { fail } from '../ipc/messages';
import type { VaultContent } from '../vault/content';
import type { ReadonlyVaultContent } from '../vault/store';

const HOSTNAME =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
// Sem espaços nem caracteres de controle.
const USERNAME = /^[^\s\p{Cc}]{1,255}$/u;

export function normalizeAddress(address: string): string {
  const trimmed = address.trim();
  const unbracketed =
    trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  return isIP(unbracketed) === 6 ? unbracketed.toLowerCase() : unbracketed;
}

export function isValidAddress(address: string): boolean {
  return isIP(address) !== 0 || HOSTNAME.test(address);
}

export const hostInputSchema = z.object({
  label: z.string().trim().min(1).max(100),
  address: z
    .string()
    .max(255)
    .transform(normalizeAddress)
    .refine(isValidAddress, 'endereço inválido'),
  port: z.number().int().min(1).max(65535),
  username: z.string().regex(USERNAME),
  authMethod: z.enum(['password', 'key', 'ask']),
  credentialId: z.uuid().nullable(),
  groupId: z.uuid().nullable(),
});

function validate(content: ReadonlyVaultContent, input: HostInput): HostInput {
  const parsed = hostInputSchema.safeParse(input);
  if (!parsed.success) throw fail('INVALID_INPUT');
  const host = parsed.data;
  if (host.authMethod === 'ask') {
    host.credentialId = null;
  } else {
    const cred = content.credentials.find((c) => c.id === host.credentialId);
    const expected = host.authMethod === 'password' ? 'password' : 'key';
    if (!cred || cred.kind !== expected) throw fail('INVALID_INPUT');
  }
  if (host.groupId !== null && !content.groups.some((g) => g.id === host.groupId)) {
    throw fail('INVALID_INPUT');
  }
  return host;
}

export function findHost(content: ReadonlyVaultContent, id: string): Host {
  const host = content.hosts.find((h) => h.id === id);
  if (!host) throw fail('NOT_FOUND');
  return host;
}

export function createHost(content: VaultContent, input: HostInput, now: string): Host {
  const host: Host = {
    ...validate(content, input),
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  content.hosts.push(host);
  return host;
}

export function updateHost(content: VaultContent, id: string, input: HostInput, now: string): Host {
  const index = content.hosts.findIndex((h) => h.id === id);
  const current = content.hosts[index];
  if (!current) throw fail('NOT_FOUND');
  const host: Host = {
    ...validate(content, input),
    id,
    createdAt: current.createdAt,
    updatedAt: now,
  };
  content.hosts[index] = host;
  return host;
}

/** Remove o host e suas regras de encaminhamento; credenciais ficam (podem ser compartilhadas). */
export function removeHost(content: VaultContent, id: string): void {
  findHost(content, id);
  content.hosts = content.hosts.filter((h) => h.id !== id);
  content.forwardRules = content.forwardRules.filter((r) => r.hostId !== id);
}

export function moveHost(
  content: VaultContent,
  id: string,
  groupId: string | null,
  now: string,
): void {
  const host = findHost(content, id);
  if (groupId !== null && !content.groups.some((g) => g.id === groupId)) {
    throw fail('INVALID_INPUT');
  }
  host.groupId = groupId;
  host.updatedAt = now;
}

const COPY_SUFFIX = ' (cópia)';

/** Primeira porta livre após `from` para o mesmo endereço de escuta (circular). */
function freeBindPort(content: VaultContent, bindAddress: string, from: number): number {
  const used = new Set(
    content.forwardRules.filter((r) => r.bindAddress === bindAddress).map((r) => r.bindPort),
  );
  for (let i = 1; i < 65535; i++) {
    const port = ((from - 1 + i) % 65535) + 1;
    if (!used.has(port)) return port;
  }
  throw fail('INVALID_INPUT');
}

/** Cópia editável com mesma credencial e regras copiadas (US3-5). */
export function duplicateHost(content: VaultContent, id: string, now: string): Host {
  const source = findHost(content, id);
  const copy: Host = {
    ...source,
    id: randomUUID(),
    label: source.label.slice(0, 100 - COPY_SUFFIX.length) + COPY_SUFFIX,
    createdAt: now,
    updatedAt: now,
  };
  content.hosts.push(copy);
  for (const rule of content.forwardRules.filter((r) => r.hostId === id)) {
    content.forwardRules.push({
      ...rule,
      id: randomUUID(),
      hostId: copy.id,
      bindPort: freeBindPort(content, rule.bindAddress, rule.bindPort),
    });
  }
  return copy;
}

export function toHostView(content: ReadonlyVaultContent, host: Host): HostView {
  const cred = content.credentials.find((c) => c.id === host.credentialId);
  return { ...host, credentialName: cred?.name ?? null };
}

export function listHostViews(content: ReadonlyVaultContent): HostView[] {
  return content.hosts.map((h) => toHostView(content, h as Host));
}

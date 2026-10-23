// Esquema do conteúdo decifrado do cofre (data-model.md, "VaultContent").
import { z } from 'zod';

export const CONTENT_SCHEMA_VERSION = 1;

const isoDate = z.iso.datetime();
const id = z.uuid();

export const vaultSettingsSchema = z.object({
  autoLockMinutes: z.number().int().min(1).max(120).nullable(),
  connectTimeoutSeconds: z.number().int().min(5).max(120),
});

export const DEFAULT_VAULT_SETTINGS: z.infer<typeof vaultSettingsSchema> = {
  autoLockMinutes: 15,
  connectTimeoutSeconds: 15,
};

export const groupSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  parentId: id.nullable(),
  sortOrder: z.number().int(),
});

export const hostSchema = z.object({
  id,
  label: z.string().min(1).max(100),
  address: z.string().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1).max(255),
  authMethod: z.enum(['password', 'key', 'ask']),
  credentialId: id.nullable(),
  groupId: id.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const keyTypeSchema = z.enum([
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
  'ssh-rsa',
]);

const passwordCredentialSchema = z.object({
  kind: z.literal('password'),
  id,
  name: z.string().min(1).max(100),
  createdAt: isoDate,
  password: z.string().min(1).max(1024),
});

const keyCredentialSchema = z.object({
  kind: z.literal('key'),
  id,
  name: z.string().min(1).max(100),
  createdAt: isoDate,
  privateKey: z
    .string()
    .min(1)
    .max(64 * 1024),
  passphrase: z.string().max(1024).nullable(),
  keyType: keyTypeSchema,
  publicKey: z.string().min(1),
  fingerprint: z.string().startsWith('SHA256:'),
  origin: z.enum(['imported', 'generated']),
});

export const credentialSchema = z.discriminatedUnion('kind', [
  passwordCredentialSchema,
  keyCredentialSchema,
]);

export const knownHostKeySchema = z.object({
  endpoint: z.string().min(1),
  keyType: z.string().min(1),
  fingerprint: z.string().startsWith('SHA256:'),
  acceptedAt: isoDate,
});

export const forwardRuleSchema = z.object({
  id,
  hostId: id,
  label: z.string().max(100).nullable(),
  bindAddress: z.string().min(1),
  allowNonLoopback: z.boolean(),
  bindPort: z.number().int().min(1).max(65535),
  destHost: z.string().min(1).max(255),
  destPort: z.number().int().min(1).max(65535),
});

export const vaultContentSchema = z.object({
  schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  settings: vaultSettingsSchema,
  groups: z.array(groupSchema),
  hosts: z.array(hostSchema),
  credentials: z.array(credentialSchema),
  knownHostKeys: z.array(knownHostKeySchema),
  forwardRules: z.array(forwardRuleSchema),
});

export type VaultContent = z.infer<typeof vaultContentSchema>;
export type StoredCredential = z.infer<typeof credentialSchema>;
export type StoredKeyCredential = z.infer<typeof keyCredentialSchema>;
export type StoredPasswordCredential = z.infer<typeof passwordCredentialSchema>;

export function emptyContent(): VaultContent {
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    settings: { ...DEFAULT_VAULT_SETTINGS },
    groups: [],
    hosts: [],
    credentials: [],
    knownHostKeys: [],
    forwardRules: [],
  };
}

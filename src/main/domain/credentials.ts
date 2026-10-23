// Credenciais: senhas e chaves privadas (data-model.md, "Credential"; FR-008, FR-009).
import { randomUUID } from 'node:crypto';
import ssh2, { type ParsedKey } from 'ssh2';
import { z } from 'zod';
import type { CredentialSummary, KeyType } from '@shared/model/types';
import { fail } from '../ipc/messages';
import {
  keyTypeSchema,
  type StoredCredential,
  type StoredKeyCredential,
  type StoredPasswordCredential,
  type VaultContent,
} from '../vault/content';
import type { ReadonlyVaultContent } from '../vault/store';
import { fingerprintOf } from './knownHosts';

const { utils } = ssh2;
const name = z.string().trim().min(1).max(100);
const passwordText = z.string().min(1).max(1024);
export const MAX_KEY_BYTES = 64 * 1024;

function parseName(value: string): string {
  const parsed = name.safeParse(value);
  if (!parsed.success) throw fail('INVALID_INPUT');
  return parsed.data;
}

function firstKey(result: ParsedKey | ParsedKey[] | Error): ParsedKey | Error {
  return Array.isArray(result) ? (result[0] ?? new Error('vazio')) : result;
}

function isPassphraseError(e: Error): boolean {
  return /passphrase/i.test(e.message);
}

interface ParsedPrivateKey {
  keyType: KeyType;
  publicKey: string;
  fingerprint: string;
  /** Passphrase de fato necessária (null se a chave não é cifrada). */
  passphrase: string | null;
}

/** Valida a chave com o ssh2; nada é salvo se falhar. */
export function parsePrivateKey(text: string, passphrase: string | null): ParsedPrivateKey {
  if (Buffer.byteLength(text, 'utf8') > MAX_KEY_BYTES) throw fail('KEY_UNSUPPORTED');
  let used: string | null = null;
  let key = firstKey(utils.parseKey(text));
  if (key instanceof Error) {
    if (!isPassphraseError(key)) throw fail('KEY_UNSUPPORTED');
    if (!passphrase) throw fail('KEY_BAD_PASSPHRASE');
    key = firstKey(utils.parseKey(text, passphrase));
    if (key instanceof Error) {
      throw fail(isPassphraseError(key) ? 'KEY_BAD_PASSPHRASE' : 'KEY_UNSUPPORTED');
    }
    used = passphrase;
  }
  if (!key.isPrivateKey()) throw fail('KEY_UNSUPPORTED');
  const keyType = keyTypeSchema.safeParse(key.type);
  if (!keyType.success) throw fail('KEY_UNSUPPORTED');
  const blob = key.getPublicSSH();
  return {
    keyType: keyType.data,
    publicKey: `${keyType.data} ${blob.toString('base64')}`,
    fingerprint: fingerprintOf(blob),
    passphrase: used,
  };
}

export function findCredential(content: ReadonlyVaultContent, id: string): StoredCredential {
  const cred = content.credentials.find((c) => c.id === id);
  if (!cred) throw fail('NOT_FOUND');
  return cred;
}

export function createPassword(
  content: VaultContent,
  credName: string,
  password: string,
  now: string,
): StoredPasswordCredential {
  if (!passwordText.safeParse(password).success) throw fail('INVALID_INPUT');
  const cred: StoredPasswordCredential = {
    kind: 'password',
    id: randomUUID(),
    name: parseName(credName),
    password,
    createdAt: now,
  };
  content.credentials.push(cred);
  return cred;
}

function addKey(
  content: VaultContent,
  credName: string,
  privateKey: string,
  passphrase: string | null,
  origin: 'imported' | 'generated',
  now: string,
): StoredKeyCredential {
  const n = parseName(credName);
  const parsed = parsePrivateKey(privateKey, passphrase);
  const cred: StoredKeyCredential = {
    kind: 'key',
    id: randomUUID(),
    name: n,
    privateKey,
    passphrase: parsed.passphrase,
    keyType: parsed.keyType,
    publicKey: parsed.publicKey,
    fingerprint: parsed.fingerprint,
    origin,
    createdAt: now,
  };
  content.credentials.push(cred);
  return cred;
}

export function importKey(
  content: VaultContent,
  credName: string,
  pemText: string,
  passphrase: string | null,
  now: string,
): StoredKeyCredential {
  return addKey(content, credName, pemText, passphrase, 'imported', now);
}

export function generateEd25519(
  content: VaultContent,
  credName: string,
  passphrase: string | null,
  now: string,
): StoredKeyCredential {
  if (passphrase !== null && !passwordText.safeParse(passphrase).success) {
    throw fail('INVALID_INPUT');
  }
  const pair = passphrase
    ? utils.generateKeyPairSync('ed25519', { passphrase, cipher: 'aes256-ctr', rounds: 16 })
    : utils.generateKeyPairSync('ed25519');
  return addKey(content, credName, pair.private, passphrase, 'generated', now);
}

export function renameCredential(
  content: VaultContent,
  id: string,
  newName: string,
): StoredCredential {
  const cred = findCredential(content, id);
  const index = content.credentials.indexOf(cred);
  const renamed = { ...cred, name: parseName(newName) };
  content.credentials[index] = renamed;
  return renamed;
}

export function usedByHostCount(content: ReadonlyVaultContent, id: string): number {
  return content.hosts.filter((h) => h.credentialId === id).length;
}

export function removeCredential(content: VaultContent, id: string): void {
  findCredential(content, id);
  if (usedByHostCount(content, id) > 0) throw fail('INVALID_INPUT');
  content.credentials = content.credentials.filter((c) => c.id !== id);
}

/** Única forma de credencial que sai do processo principal. */
export function toSummary(
  content: ReadonlyVaultContent,
  cred: Readonly<StoredCredential>,
): CredentialSummary {
  const base = {
    id: cred.id,
    name: cred.name,
    kind: cred.kind,
    createdAt: cred.createdAt,
    usedByHostCount: usedByHostCount(content, cred.id),
  };
  if (cred.kind === 'password') {
    return { ...base, keyType: null, publicKey: null, fingerprint: null, origin: null };
  }
  return {
    ...base,
    keyType: cred.keyType,
    publicKey: cred.publicKey,
    fingerprint: cred.fingerprint,
    origin: cred.origin,
  };
}

// Chaves de servidor aceitas (data-model.md, "KnownHostKey"; FR-013).
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type { KnownHostKey } from '@shared/model/types';
import type { VaultContent } from '../vault/content';
import type { ReadonlyVaultContent } from '../vault/store';
import { normalizeAddress } from './hosts';

export type HostKeyCheck =
  { kind: 'new' } | { kind: 'match' } | { kind: 'changed'; previous: KnownHostKey };

export function endpointOf(address: string, port: number): string {
  const normalized = normalizeAddress(address).toLowerCase();
  return isIP(normalized) === 6 ? `[${normalized}]:${port}` : `${normalized}:${port}`;
}

/** Formato do OpenSSH: `SHA256:` + base64 sem padding. */
export function fingerprintOf(keyBlob: Uint8Array): string {
  return `SHA256:${createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '')}`;
}

/** O blob SSH começa com o nome do tipo (string com tamanho uint32). */
export function keyTypeOf(keyBlob: Uint8Array): string {
  const buf = Buffer.from(keyBlob);
  if (buf.length < 4) return 'unknown';
  const len = buf.readUInt32BE(0);
  return len > 0 && len < 64 && buf.length >= 4 + len
    ? buf.subarray(4, 4 + len).toString('ascii')
    : 'unknown';
}

export function checkHostKey(
  content: ReadonlyVaultContent,
  endpoint: string,
  keyType: string,
  fingerprint: string,
): HostKeyCheck {
  const known = content.knownHostKeys.find((k) => k.endpoint === endpoint);
  if (!known) return { kind: 'new' };
  if (known.keyType === keyType && known.fingerprint === fingerprint) return { kind: 'match' };
  return { kind: 'changed', previous: { ...known } };
}

export function acceptHostKey(
  content: VaultContent,
  endpoint: string,
  keyType: string,
  fingerprint: string,
  now: string,
): void {
  content.knownHostKeys = content.knownHostKeys.filter((k) => k.endpoint !== endpoint);
  content.knownHostKeys.push({ endpoint, keyType, fingerprint, acceptedAt: now });
}

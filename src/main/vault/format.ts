// Layout binário de vault.svlt (data-model.md, "Arquivo do cofre").
//   magic "SVLT" (4) | formatVersion uint16 BE | headerLength uint32 BE | header JSON | payload
// Tudo antes do payload é o *additional data* das duas cifragens.
import { z } from 'zod';
import { fail } from '../ipc/messages';

export const SUPPORTED_FORMAT_VERSION = 1;
const MAGIC = Buffer.from('SVLT', 'ascii');
const PREFIX_BYTES = 4 + 2 + 4;
const MAX_HEADER_BYTES = 64 * 1024;

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const headerSchema = z.object({
  kdf: z.object({
    alg: z.literal('argon2id13'),
    opsLimit: z.number().int().positive(),
    memLimit: z.number().int().positive(),
    salt: base64,
  }),
  wrappedDek: base64,
  createdAt: z.iso.datetime(),
});

export type VaultHeader = z.infer<typeof headerSchema>;

export interface DecodedVault {
  formatVersion: number;
  header: VaultHeader;
  /** Bytes antes do payload (AD). */
  headerBytes: Uint8Array;
  payload: Uint8Array;
}

export function encodeVaultFile(
  header: VaultHeader,
  payload: Uint8Array,
): { bytes: Uint8Array; headerBytes: Uint8Array } {
  const json = Buffer.from(JSON.stringify(header), 'utf8');
  const prefix = Buffer.alloc(PREFIX_BYTES);
  MAGIC.copy(prefix, 0);
  prefix.writeUInt16BE(SUPPORTED_FORMAT_VERSION, 4);
  prefix.writeUInt32BE(json.length, 6);
  const headerBytes = new Uint8Array(Buffer.concat([prefix, json]));
  const bytes = new Uint8Array(headerBytes.length + payload.length);
  bytes.set(headerBytes, 0);
  bytes.set(payload, headerBytes.length);
  return { bytes, headerBytes };
}

/** Lê só o prefixo: a versão vem antes de qualquer validação do resto. */
export function readFormatVersion(bytes: Uint8Array): number {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < PREFIX_BYTES || !buf.subarray(0, 4).equals(MAGIC)) {
    throw fail('VAULT_UNREADABLE');
  }
  return buf.readUInt16BE(4);
}

export function decodeVaultFile(bytes: Uint8Array): DecodedVault {
  const formatVersion = readFormatVersion(bytes);
  if (formatVersion > SUPPORTED_FORMAT_VERSION || formatVersion < 1) {
    throw fail('VAULT_UNSUPPORTED_VERSION');
  }
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLength = buf.readUInt32BE(6);
  const headerEnd = PREFIX_BYTES + headerLength;
  if (headerLength === 0 || headerLength > MAX_HEADER_BYTES || headerEnd >= buf.length) {
    throw fail('VAULT_UNREADABLE');
  }
  let header: VaultHeader;
  try {
    header = headerSchema.parse(JSON.parse(buf.subarray(PREFIX_BYTES, headerEnd).toString('utf8')));
  } catch {
    throw fail('VAULT_UNREADABLE');
  }
  return {
    formatVersion,
    header,
    headerBytes: new Uint8Array(bytes.subarray(0, headerEnd)),
    payload: new Uint8Array(bytes.subarray(headerEnd)),
  };
}

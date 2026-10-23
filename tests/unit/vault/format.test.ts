import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_FORMAT_VERSION,
  decodeVaultFile,
  encodeVaultFile,
  type VaultHeader,
} from '../../../src/main/vault/format';

const header: VaultHeader = {
  kdf: { alg: 'argon2id13', opsLimit: 2, memLimit: 65536, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
  wrappedDek: 'd3JhcHBlZA==',
  createdAt: '2026-10-23T00:00:00.000Z',
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('vault/format', () => {
  it('codifica e decodifica cabeçalho e payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const { bytes, headerBytes } = encodeVaultFile(header, payload);
    expect(Buffer.from(bytes.subarray(0, 4)).toString('ascii')).toBe('SVLT');
    expect(new DataView(bytes.buffer, bytes.byteOffset).getUint16(4)).toBe(1);
    expect(SUPPORTED_FORMAT_VERSION).toBe(1);

    const decoded = decodeVaultFile(bytes);
    expect(decoded.header).toEqual(header);
    expect([...decoded.payload]).toEqual([1, 2, 3, 4]);
    expect(Buffer.from(decoded.headerBytes).equals(Buffer.from(headerBytes))).toBe(true);
  });

  it('magic errado → VAULT_UNREADABLE', () => {
    const { bytes } = encodeVaultFile(header, new Uint8Array([1]));
    bytes[0] = 0x58;
    expect(codeOf(() => decodeVaultFile(bytes))).toBe('VAULT_UNREADABLE');
  });

  it('formatVersion 2 → VAULT_UNSUPPORTED_VERSION', () => {
    const { bytes } = encodeVaultFile(header, new Uint8Array([1]));
    new DataView(bytes.buffer, bytes.byteOffset).setUint16(4, 2);
    expect(codeOf(() => decodeVaultFile(bytes))).toBe('VAULT_UNSUPPORTED_VERSION');
  });

  it('arquivo truncado → VAULT_UNREADABLE', () => {
    const { bytes } = encodeVaultFile(header, new Uint8Array([1]));
    expect(codeOf(() => decodeVaultFile(bytes.subarray(0, 12)))).toBe('VAULT_UNREADABLE');
    expect(codeOf(() => decodeVaultFile(bytes.subarray(0, 3)))).toBe('VAULT_UNREADABLE');
    expect(codeOf(() => decodeVaultFile(new Uint8Array()))).toBe('VAULT_UNREADABLE');
  });

  it('cabeçalho com JSON inválido → VAULT_UNREADABLE', () => {
    const { bytes } = encodeVaultFile(header, new Uint8Array([1]));
    bytes[10] = 0x7b; // altera um byte do JSON
    bytes[11] = 0x7b;
    expect(codeOf(() => decodeVaultFile(bytes))).toBe('VAULT_UNREADABLE');
  });

  it('payload vazio → VAULT_UNREADABLE', () => {
    const { bytes } = encodeVaultFile(header, new Uint8Array());
    expect(codeOf(() => decodeVaultFile(bytes))).toBe('VAULT_UNREADABLE');
  });
});

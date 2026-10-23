import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  acceptHostKey,
  checkHostKey,
  endpointOf,
  fingerprintOf,
  keyTypeOf,
} from '../../../src/main/domain/knownHosts';
import { emptyContent } from '../../../src/main/vault/content';
import { KEYS_DIR, generateTestKeys } from '../../../scripts/gen-test-keys.mjs';

function blobOf(pubFile: string): Buffer {
  generateTestKeys();
  const [, b64] = readFileSync(join(KEYS_DIR, pubFile), 'utf8').split(' ');
  return Buffer.from(b64 ?? '', 'base64');
}

describe('domain/knownHosts', () => {
  it('endpoint normaliza endereço e inclui porta', () => {
    expect(endpointOf('SRV.Example.com', 22)).toBe('srv.example.com:22');
    expect(endpointOf('[2001:DB8::1]', 2222)).toBe('[2001:db8::1]:2222');
    expect(endpointOf('::1', 22)).toBe('[::1]:22');
  });

  it('fingerprint = SHA256 base64 sem padding do blob', () => {
    const blob = blobOf('ed25519.pub');
    const expected = createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');
    expect(fingerprintOf(blob)).toBe(`SHA256:${expected}`);
    expect(fingerprintOf(blob)).not.toContain('=');
  });

  it('extrai o tipo da chave do blob', () => {
    expect(keyTypeOf(blobOf('ed25519.pub'))).toBe('ssh-ed25519');
    expect(keyTypeOf(blobOf('ecdsa-p256.pub'))).toBe('ecdsa-sha2-nistp256');
  });

  it('new → accept → match → changed', () => {
    const c = emptyContent();
    const ep = endpointOf('h', 22);
    expect(checkHostKey(c, ep, 'ssh-ed25519', 'SHA256:aaa')).toEqual({ kind: 'new' });

    acceptHostKey(c, ep, 'ssh-ed25519', 'SHA256:aaa', '2026-10-23T10:00:00.000Z');
    expect(checkHostKey(c, ep, 'ssh-ed25519', 'SHA256:aaa')).toEqual({ kind: 'match' });

    const changed = checkHostKey(c, ep, 'ssh-ed25519', 'SHA256:bbb');
    expect(changed).toMatchObject({ kind: 'changed', previous: { fingerprint: 'SHA256:aaa' } });

    // Tipo diferente também é divergência.
    expect(checkHostKey(c, ep, 'ssh-rsa', 'SHA256:aaa').kind).toBe('changed');
  });

  it('accept substitui a chave anterior', () => {
    const c = emptyContent();
    const ep = endpointOf('h', 22);
    acceptHostKey(c, ep, 'ssh-ed25519', 'SHA256:aaa', '2026-10-23T10:00:00.000Z');
    acceptHostKey(c, ep, 'ssh-ed25519', 'SHA256:bbb', '2026-10-23T11:00:00.000Z');
    expect(c.knownHostKeys).toEqual([
      {
        endpoint: ep,
        keyType: 'ssh-ed25519',
        fingerprint: 'SHA256:bbb',
        acceptedAt: '2026-10-23T11:00:00.000Z',
      },
    ]);
  });

  it('portas diferentes são endpoints diferentes', () => {
    const c = emptyContent();
    acceptHostKey(c, endpointOf('h', 22), 'ssh-ed25519', 'SHA256:aaa', '2026-10-23T10:00:00.000Z');
    expect(checkHostKey(c, endpointOf('h', 2222), 'ssh-ed25519', 'SHA256:aaa').kind).toBe('new');
  });
});

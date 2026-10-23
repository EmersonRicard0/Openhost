import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ssh2 from 'ssh2';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createPassword,
  generateEd25519,
  importKey,
  removeCredential,
  renameCredential,
  toSummary,
} from '../../../src/main/domain/credentials';
import { emptyContent } from '../../../src/main/vault/content';
import { KEYS_DIR, TEST_PASSPHRASE, generateTestKeys } from '../../../scripts/gen-test-keys.mjs';

const T0 = '2026-10-23T10:00:00.000Z';
const key = (name: string) => readFileSync(join(KEYS_DIR, name), 'utf8');

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('domain/credentials', () => {
  beforeAll(() => {
    generateTestKeys();
  });

  it('cria credencial de senha', () => {
    const c = emptyContent();
    const cred = createPassword(c, 'prod', 's3nha', T0);
    expect(cred).toMatchObject({ kind: 'password', name: 'prod', password: 's3nha' });
    expect(codeOf(() => createPassword(c, '', 'x', T0))).toBe('INVALID_INPUT');
    expect(codeOf(() => createPassword(c, 'a', '', T0))).toBe('INVALID_INPUT');
    expect(codeOf(() => createPassword(c, 'a', 'x'.repeat(1025), T0))).toBe('INVALID_INPUT');
    expect(codeOf(() => createPassword(c, 'n'.repeat(101), 'x', T0))).toBe('INVALID_INPUT');
  });

  it.each([
    ['ed25519', 'ssh-ed25519'],
    ['ecdsa-p256', 'ecdsa-sha2-nistp256'],
    ['rsa-pem', 'ssh-rsa'],
  ])('importa %s', (file, keyType) => {
    const c = emptyContent();
    const cred = importKey(c, file, key(file), null, T0);
    expect(cred).toMatchObject({ kind: 'key', keyType, origin: 'imported', passphrase: null });
    expect(cred.publicKey.startsWith(`${keyType} `)).toBe(true);
    expect(cred.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
    // Mesma chave pública do arquivo .pub gerado.
    expect(key(`${file}.pub`)).toContain(cred.publicKey);
  });

  it('importa chave com passphrase correta', () => {
    const c = emptyContent();
    const cred = importKey(c, 'p', key('ed25519-passphrase'), TEST_PASSPHRASE, T0);
    expect(cred.passphrase).toBe(TEST_PASSPHRASE);
  });

  it('passphrase errada ou ausente → KEY_BAD_PASSPHRASE e nada é salvo', () => {
    const c = emptyContent();
    expect(codeOf(() => importKey(c, 'p', key('ed25519-passphrase'), 'errada', T0))).toBe(
      'KEY_BAD_PASSPHRASE',
    );
    expect(codeOf(() => importKey(c, 'p', key('ed25519-passphrase'), null, T0))).toBe(
      'KEY_BAD_PASSPHRASE',
    );
    expect(c.credentials).toHaveLength(0);
  });

  it('arquivo inválido → KEY_UNSUPPORTED', () => {
    const c = emptyContent();
    expect(codeOf(() => importKey(c, 'x', key('invalid'), null, T0))).toBe('KEY_UNSUPPORTED');
    expect(codeOf(() => importKey(c, 'x', key('ed25519.pub'), null, T0))).toBe('KEY_UNSUPPORTED');
    expect(c.credentials).toHaveLength(0);
  });

  it('chave sem passphrase ignora passphrase informada', () => {
    const c = emptyContent();
    expect(importKey(c, 'x', key('ed25519'), 'qualquer', T0).passphrase).toBeNull();
  });

  it('gera Ed25519 que o ssh2 consegue abrir', () => {
    const c = emptyContent();
    const plain = generateEd25519(c, 'nova', null, T0);
    expect(plain).toMatchObject({ keyType: 'ssh-ed25519', origin: 'generated' });
    expect(ssh2.utils.parseKey(plain.privateKey)).not.toBeInstanceOf(Error);

    const withPass = generateEd25519(c, 'nova2', 'frase-123', T0);
    expect(ssh2.utils.parseKey(withPass.privateKey)).toBeInstanceOf(Error);
    expect(ssh2.utils.parseKey(withPass.privateKey, 'frase-123')).not.toBeInstanceOf(Error);
  });

  it('remove credencial em uso → INVALID_INPUT', () => {
    const c = emptyContent();
    const cred = createPassword(c, 'prod', 'x', T0);
    c.hosts.push({
      id: '00000000-0000-4000-8000-0000000000c1',
      label: 'h',
      address: 'h',
      port: 22,
      username: 'u',
      authMethod: 'password',
      credentialId: cred.id,
      groupId: null,
      createdAt: T0,
      updatedAt: T0,
    });
    expect(
      codeOf(() => {
        removeCredential(c, cred.id);
      }),
    ).toBe('INVALID_INPUT');
    expect(toSummary(c, cred).usedByHostCount).toBe(1);
    c.hosts = [];
    removeCredential(c, cred.id);
    expect(c.credentials).toHaveLength(0);
  });

  it('renomeia', () => {
    const c = emptyContent();
    const cred = createPassword(c, 'a', 'x', T0);
    expect(renameCredential(c, cred.id, '  b ').name).toBe('b');
  });

  it('toSummary nunca contém segredos', () => {
    const c = emptyContent();
    const pw = createPassword(c, 'pw', 'senha-super-secreta', T0);
    const k = importKey(c, 'k', key('ed25519-passphrase'), TEST_PASSPHRASE, T0);
    for (const cred of [pw, k]) {
      const json = JSON.stringify(toSummary(c, cred));
      expect(json).not.toContain('senha-super-secreta');
      expect(json).not.toContain(TEST_PASSPHRASE);
      expect(json).not.toContain('PRIVATE KEY');
      expect(Object.keys(toSummary(c, cred))).not.toContain('password');
      expect(Object.keys(toSummary(c, cred))).not.toContain('privateKey');
      expect(Object.keys(toSummary(c, cred))).not.toContain('passphrase');
    }
  });
});

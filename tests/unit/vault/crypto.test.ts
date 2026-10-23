import { beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_KDF,
  deriveKek,
  memzero,
  open,
  randomKey,
  randomSalt,
  ready,
  seal,
} from '../../../src/main/vault/crypto';

const enc = new TextEncoder();

describe('vault/crypto', () => {
  beforeAll(async () => {
    await ready();
  });

  it('deriveKek é determinística para mesma senha + salt', () => {
    const salt = randomSalt();
    const a = deriveKek('senha-teste-1', { ...TEST_KDF, salt });
    const b = deriveKek('senha-teste-1', { ...TEST_KDF, salt });
    const c = deriveKek('senha-teste-2', { ...TEST_KDF, salt });
    const d = deriveKek('senha-teste-1', { ...TEST_KDF, salt: randomSalt() });
    expect(a).toHaveLength(32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
    expect(Buffer.from(a).equals(Buffer.from(d))).toBe(false);
  });

  it('seal/open com additional data', () => {
    const key = randomKey();
    const ad = enc.encode('cabeçalho');
    const sealed = seal(key, enc.encode('conteúdo secreto'), ad);
    expect(new TextDecoder().decode(open(key, sealed, ad))).toBe('conteúdo secreto');
  });

  it('falha com AD alterado', () => {
    const key = randomKey();
    const sealed = seal(key, enc.encode('x'), enc.encode('ad-1'));
    expect(() => open(key, sealed, enc.encode('ad-2'))).toThrow();
  });

  it('falha com 1 bit trocado no ciphertext', () => {
    const key = randomKey();
    const ad = enc.encode('ad');
    const sealed = seal(key, enc.encode('conteúdo'), ad);
    const last = sealed.length - 1;
    sealed[last] = (sealed[last] ?? 0) ^ 1;
    expect(() => open(key, sealed, ad)).toThrow();
  });

  it('falha com chave errada', () => {
    const sealed = seal(randomKey(), enc.encode('x'), enc.encode('ad'));
    expect(() => open(randomKey(), sealed, enc.encode('ad'))).toThrow();
  });

  it('usa nonce novo a cada seal', () => {
    const key = randomKey();
    const ad = enc.encode('ad');
    const a = seal(key, enc.encode('igual'), ad);
    const b = seal(key, enc.encode('igual'), ad);
    expect(Buffer.from(a.subarray(0, 24)).equals(Buffer.from(b.subarray(0, 24)))).toBe(false);
  });

  it('memzero zera o buffer', () => {
    const key = randomKey();
    memzero(key);
    expect(key.every((byte) => byte === 0)).toBe(true);
  });
});

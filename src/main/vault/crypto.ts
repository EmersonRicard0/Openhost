// Primitivas do cofre sobre libsodium (research R9). Nenhuma criptografia própria.
import sodium from 'libsodium-wrappers-sumo';

export interface KdfCost {
  opsLimit: number;
  memLimit: number;
}

export interface KdfParams extends KdfCost {
  salt: Uint8Array;
}

const KEY_BYTES = 32;
const SALT_BYTES = 16;
const NONCE_BYTES = 24;

let isReady = false;

export async function ready(): Promise<void> {
  if (isReady) return;
  await sodium.ready;
  isReady = true;
}

function lib(): typeof sodium {
  if (!isReady) throw new Error('libsodium não inicializada');
  return sodium;
}

/** Argon2id "moderate": 3 passes, 256 MiB. */
export function defaultKdf(): KdfCost {
  const s = lib();
  return {
    opsLimit: s.crypto_pwhash_OPSLIMIT_MODERATE,
    memLimit: s.crypto_pwhash_MEMLIMIT_MODERATE,
  };
}

/** Custo mínimo do Argon2id, só para testes. */
export const TEST_KDF: KdfCost = { opsLimit: 1, memLimit: 8192 };

export function deriveKek(password: string, params: KdfParams): Uint8Array {
  const s = lib();
  return s.crypto_pwhash(
    KEY_BYTES,
    password,
    params.salt,
    params.opsLimit,
    params.memLimit,
    s.crypto_pwhash_ALG_ARGON2ID13,
  );
}

export function randomKey(): Uint8Array {
  return lib().randombytes_buf(KEY_BYTES);
}

export function randomSalt(): Uint8Array {
  return lib().randombytes_buf(SALT_BYTES);
}

/** XChaCha20-Poly1305: retorna `nonce(24) ‖ ciphertext`. */
export function seal(key: Uint8Array, plaintext: Uint8Array, ad: Uint8Array): Uint8Array {
  const s = lib();
  const nonce = s.randombytes_buf(NONCE_BYTES);
  const ct = s.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, ad, null, nonce, key);
  const out = new Uint8Array(NONCE_BYTES + ct.length);
  out.set(nonce, 0);
  out.set(ct, NONCE_BYTES);
  return out;
}

/** Lança se a chave, o AD ou o conteúdo não conferirem. */
export function open(key: Uint8Array, sealed: Uint8Array, ad: Uint8Array): Uint8Array {
  if (sealed.length <= NONCE_BYTES) throw new Error('conteúdo cifrado inválido');
  return lib().crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    sealed.subarray(NONCE_BYTES),
    ad,
    sealed.subarray(0, NONCE_BYTES),
    key,
  );
}

export function memzero(buf: Uint8Array): void {
  lib().memzero(buf);
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function fromBase64(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'base64'));
}

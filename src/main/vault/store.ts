// Cofre local: envelope DEK/KEK, gravação atômica, bloqueio (research R9, data-model.md).
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { VaultState, VaultStatus } from '@shared/model/types';
import { fail } from '../ipc/messages';
import { writeFileAtomic } from '../fs/atomic';
import { emptyContent, vaultContentSchema, type VaultContent } from './content';
import {
  defaultKdf,
  deriveKek,
  fromBase64,
  memzero,
  open as aeadOpen,
  randomKey,
  randomSalt,
  ready,
  seal,
  toBase64,
  type KdfCost,
} from './crypto';
import { decodeVaultFile, encodeVaultFile, type VaultHeader } from './format';
import { migrateContent } from './migrations';

export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 1024;
const VAULT_FILE = 'vault.svlt';
const BACKUP_FILE = 'vault.bak';

type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type ReadonlyVaultContent = DeepReadonly<VaultContent>;

export interface VaultStoreOptions {
  /** Custo do Argon2id para cofres novos e trocas de senha (testes usam o mínimo). */
  kdf?: KdfCost;
}

function validateNewPassword(password: string, confirmation: string): void {
  const length = Array.from(password).length;
  if (length < MIN_PASSWORD_LENGTH) throw fail('WEAK_PASSWORD');
  if (length > MAX_PASSWORD_LENGTH) throw fail('INVALID_INPUT');
  if (password !== confirmation) throw fail('INVALID_INPUT');
}

/** AD da chave encapsulada: autentica parâmetros do KDF e data de criação. */
function wrapAd(header: Pick<VaultHeader, 'kdf' | 'createdAt'>): Uint8Array {
  return new Uint8Array(
    Buffer.from(JSON.stringify({ v: 1, kdf: header.kdf, createdAt: header.createdAt }), 'utf8'),
  );
}

export class VaultStore {
  private statusValue: VaultStatus;
  private dek: Uint8Array | null = null;
  private header: VaultHeader | null = null;
  private content: VaultContent | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(s: VaultStatus) => void>();

  private constructor(
    private readonly dir: string,
    private readonly kdf: KdfCost,
    status: VaultStatus,
  ) {
    this.statusValue = status;
  }

  static async open(dir: string, options: VaultStoreOptions = {}): Promise<VaultStore> {
    await ready();
    return new VaultStore(
      dir,
      options.kdf ?? defaultKdf(),
      VaultStore.probe(join(dir, VAULT_FILE)),
    );
  }

  private static probe(path: string): VaultStatus {
    if (!existsSync(path)) return { state: 'nonexistent', reason: null };
    try {
      decodeVaultFile(readFileSync(path));
      return { state: 'locked', reason: null };
    } catch (e) {
      const unsupported = (e as { code?: string }).code === 'VAULT_UNSUPPORTED_VERSION';
      return { state: 'unreadable', reason: unsupported ? 'unsupportedVersion' : 'corrupted' };
    }
  }

  get state(): VaultState {
    return this.statusValue.state;
  }

  get status(): VaultStatus {
    return this.statusValue;
  }

  private get path(): string {
    return join(this.dir, VAULT_FILE);
  }

  onStateChanged(listener: (s: VaultStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: VaultStatus): void {
    this.statusValue = status;
    for (const l of this.listeners) l(status);
  }

  async create(password: string, confirmation: string): Promise<void> {
    await this.serial(() => {
      if (this.state !== 'nonexistent') throw fail('VAULT_EXISTS');
      validateNewPassword(password, confirmation);
      const dek = randomKey();
      this.header = this.newHeader(password, dek, new Date().toISOString());
      this.dek = dek;
      const content = emptyContent();
      this.save(content);
      this.content = content;
      this.setStatus({ state: 'unlocked', reason: null });
    });
  }

  async unlock(password: string): Promise<void> {
    await this.serial(() => {
      if (this.state === 'unlocked') return;
      if (this.state === 'nonexistent') throw fail('VAULT_NOT_FOUND');
      if (this.state === 'unreadable') throw fail('VAULT_UNREADABLE');

      const decoded = decodeVaultFile(readFileSync(this.path));
      const dek = this.unwrap(password, decoded.header);
      let plaintext: Uint8Array;
      try {
        plaintext = aeadOpen(dek, decoded.payload, decoded.headerBytes);
      } catch {
        memzero(dek);
        throw fail('VAULT_BAD_PASSWORD');
      }

      let content: VaultContent;
      let migrated: { migrated: boolean; from: number };
      try {
        const raw: unknown = JSON.parse(Buffer.from(plaintext).toString('utf8'));
        const result = migrateContent(raw);
        migrated = result;
        content = vaultContentSchema.parse(result.content);
      } catch {
        memzero(dek);
        this.setStatus({ state: 'unreadable', reason: 'corrupted' });
        throw fail('VAULT_UNREADABLE');
      } finally {
        memzero(plaintext);
      }

      this.dek = dek;
      this.header = decoded.header;
      if (migrated.migrated) {
        copyFileSync(this.path, join(this.dir, `vault.v${migrated.from}.bak`));
        this.save(content);
      }
      this.content = content;
      this.setStatus({ state: 'unlocked', reason: null });
    });
  }

  lock(): void {
    if (this.dek) memzero(this.dek);
    this.dek = null;
    this.header = null;
    this.content = null;
    if (this.state === 'unlocked') this.setStatus({ state: 'locked', reason: null });
  }

  async changePassword(current: string, next: string, confirmation: string): Promise<void> {
    await this.serial(() => {
      const { dek, header, content } = this.requireUnlocked();
      memzero(this.unwrap(current, header));
      validateNewPassword(next, confirmation);
      this.header = this.newHeader(next, dek, header.createdAt);
      this.save(content);
    });
  }

  async erase(): Promise<void> {
    await this.serial(() => {
      this.lock();
      for (const f of readdirSync(this.dir)) {
        if (f === VAULT_FILE || f === BACKUP_FILE || /^vault\.v\d+\.bak$/.test(f)) {
          rmSync(join(this.dir, f), { force: true });
        }
      }
      this.setStatus({ state: 'nonexistent', reason: null });
    });
  }

  read(): ReadonlyVaultContent {
    return this.requireUnlocked().content;
  }

  /** Aplica `fn` a uma cópia, valida e grava; mutações são serializadas. */
  async mutate<T>(fn: (draft: VaultContent) => T): Promise<T> {
    return this.serial(() => {
      const { content } = this.requireUnlocked();
      const draft = structuredClone(content);
      const result = fn(draft);
      const parsed = vaultContentSchema.safeParse(draft);
      if (!parsed.success) throw fail('INVALID_INPUT');
      this.save(parsed.data);
      this.content = parsed.data;
      return result;
    });
  }

  private serial<T>(fn: () => T): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private requireUnlocked(): { dek: Uint8Array; header: VaultHeader; content: VaultContent } {
    if (this.state !== 'unlocked' || !this.dek || !this.header || !this.content) {
      throw fail('VAULT_LOCKED');
    }
    return { dek: this.dek, header: this.header, content: this.content };
  }

  private newHeader(password: string, dek: Uint8Array, createdAt: string): VaultHeader {
    const salt = randomSalt();
    const kdf = {
      alg: 'argon2id13' as const,
      opsLimit: this.kdf.opsLimit,
      memLimit: this.kdf.memLimit,
      salt: toBase64(salt),
    };
    const kek = deriveKek(password, { ...this.kdf, salt });
    try {
      return { kdf, createdAt, wrappedDek: toBase64(seal(kek, dek, wrapAd({ kdf, createdAt }))) };
    } finally {
      memzero(kek);
    }
  }

  /** Senha errada e cabeçalho adulterado dão o mesmo erro (contrato). */
  private unwrap(password: string, header: VaultHeader): Uint8Array {
    const kek = deriveKek(password, {
      opsLimit: header.kdf.opsLimit,
      memLimit: header.kdf.memLimit,
      salt: fromBase64(header.kdf.salt),
    });
    try {
      return aeadOpen(kek, fromBase64(header.wrappedDek), wrapAd(header));
    } catch {
      throw fail('VAULT_BAD_PASSWORD');
    } finally {
      memzero(kek);
    }
  }

  private save(content: VaultContent): void {
    const { dek, header } = { dek: this.dek, header: this.header };
    if (!dek || !header) throw fail('VAULT_LOCKED');
    const { headerBytes } = encodeVaultFile(header, new Uint8Array());
    const plaintext = new Uint8Array(Buffer.from(JSON.stringify(content), 'utf8'));
    const payload = seal(dek, plaintext, headerBytes);
    memzero(plaintext);
    const { bytes } = encodeVaultFile(header, payload);
    if (existsSync(this.path)) copyFileSync(this.path, join(this.dir, BACKUP_FILE));
    writeFileAtomic(this.path, bytes);
  }
}

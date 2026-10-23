// Migrações do cofre (data-model.md, "Migração"; Princípio III).
//
// - formatMigrations: envelope binário, indexadas pela `formatVersion` de origem.
// - contentMigrations: conteúdo decifrado, indexadas pelo `schemaVersion` de origem;
//   rodam após decifrar e antes da validação zod.
//
// Antes de gravar uma versão migrada, o arquivo original é copiado para `vault.vN.bak`
// (N = versão anterior). Toda migração nova MUST vir com teste.
import { CONTENT_SCHEMA_VERSION } from './content';

export type ContentMigration = (content: Record<string, unknown>) => Record<string, unknown>;

export const formatMigrations: Record<number, (bytes: Uint8Array) => Uint8Array> = {};

export const contentMigrations: Record<number, ContentMigration> = {};

/** Leva o conteúdo bruto até CONTENT_SCHEMA_VERSION; indica se algo mudou. */
export function migrateContent(raw: unknown): {
  content: unknown;
  migrated: boolean;
  from: number;
} {
  if (typeof raw !== 'object' || raw === null) return { content: raw, migrated: false, from: 0 };
  let content = raw as Record<string, unknown>;
  const from = typeof content.schemaVersion === 'number' ? content.schemaVersion : 0;
  let version = from;
  while (version < CONTENT_SCHEMA_VERSION) {
    const step = contentMigrations[version];
    if (!step) break;
    content = step(content);
    version++;
  }
  return { content, migrated: version !== from, from };
}

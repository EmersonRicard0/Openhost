// Opções derivadas para a tela de importar e exportar.
import type { Group, ImportWarning, PreviewKey, PreviewRow } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { groupPaths } from '../hosts/tree';

const ie = t.importExport;

/** Valor do seletor para "sem grupo" (o Select só aceita texto). */
export const ROOT = '';

/** Grupos do cofre em ordem de caminho, com a raiz primeiro. */
export function groupOptions(
  groups: readonly Group[],
  rootLabel: string,
): { value: string; label: string }[] {
  const paths = groupPaths(groups);
  const sorted = [...paths.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  return [{ value: ROOT, label: rootLabel }, ...sorted.map(([value, label]) => ({ value, label }))];
}

export function warningText(w: ImportWarning): string {
  switch (w.code) {
    case 'OPTION_IGNORED':
      return ie.warnings.OPTION_IGNORED(w.name ?? '?');
    case 'TOKEN_UNSUPPORTED':
      return ie.warnings.TOKEN_UNSUPPORTED(w.name ?? '?');
    case 'LINE_UNREADABLE':
      return ie.warnings.LINE_UNREADABLE(w.line ?? 0);
    default:
      return ie.warnings[w.code];
  }
}

/** Texto da coluna "Chave": nome e situação, ou "senha" quando não há chave. */
export function keyText(row: PreviewRow, keys: ReadonlyMap<string, PreviewKey>): string {
  const key = row.keyRef ? keys.get(row.keyRef) : undefined;
  if (!key) return ie.noKey;
  return key.status === 'ready' ? key.name : `${key.name} · ${ie.keyStatus[key.status]}`;
}

/** Linhas inválidas só podem ser marcadas depois de corrigidas (FR-304). */
export function canSelect(row: PreviewRow): boolean {
  return row.state !== 'invalid';
}

/** Porta digitada na prévia: inteiro de 1 a 65535, ou null. */
export function parsePort(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 1 && n <= 65535 ? n : null;
}

export type Strength = 0 | 1 | 2 | 3 | 4;

/**
 * Força estimada da senha do arquivo: 0 abaixo do mínimo; depois sobe com o comprimento e a
 * variedade de caracteres (minúsculas, maiúsculas, dígitos, símbolos).
 */
export function passwordStrength(password: string, minLength: number): Strength {
  const length = Array.from(password).length;
  if (length < minLength) return 0;
  const classes = [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((re) =>
    re.test(password),
  ).length;
  let score = 1;
  if (length >= 12) score++;
  if (classes >= 3) score++;
  if (length >= 16 && classes >= 2) score++;
  return Math.min(score, 4) as Strength;
}

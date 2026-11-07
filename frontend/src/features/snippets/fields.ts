// Campos `{nome}` dos comandos (specs/012, R8). `{{` e `}}` são chaves literais; só
// `{letras, números, - ou _}` com até 32 caracteres vira campo. Mesma tabela de casos do Go.
const TOKEN = /\{\{|\}\}|\{([A-Za-z0-9_-]{1,32})\}/g;

/** Valor máximo de um campo. */
export const FIELD_MAX = 1000;

/** Nomes dos campos na ordem da primeira ocorrência, sem repetir. */
export function parseFields(text: string): string[] {
  const seen: string[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const name = m[1];
    if (name !== undefined && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

/** Troca cada `{campo}` pelo valor e desfaz `{{`/`}}`. */
export function fill(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(TOKEN, (token, name: string | undefined) => {
    if (token === '{{') return '{';
    if (token === '}}') return '}';
    return name !== undefined ? (values[name] ?? token) : token;
  });
}

/** Mensagem de recusa do valor, ou `null` se pode enviar. */
export function fieldError(name: string, value: string): string | null {
  if (/[\r\n]/.test(value)) return `O campo ${name} não pode ter quebra de linha`;
  if (value.trim() === '') return `Preencha o campo ${name}`;
  if (value.length > FIELD_MAX) return `O campo ${name} passa de ${String(FIELD_MAX)} caracteres`;
  return null;
}

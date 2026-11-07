// Ordem dos comandos na paleta (specs/012, US5): sem busca, os com tag em comum com o host da
// sessão vêm primeiro, depois os sem tag; os de outras tags só aparecem buscando. Com busca, todos
// entram, por nome ou texto, sem caixa nem acento (normalização da 009).
import type { Snippet } from '@shared/model/types';
import { normalize } from '../hosts/search';

export function rankSnippets(
  snippets: readonly Snippet[],
  hostTags: readonly string[],
  query: string,
): Snippet[] {
  const host = new Set(hostTags.map((t) => t.toLowerCase()));
  const shared = (s: Snippet) => s.tags.some((t) => host.has(t.toLowerCase()));
  const q = normalize(query.trim());
  const byName = (a: Snippet, b: Snippet) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

  if (q === '') {
    const mine = snippets.filter(shared).sort(byName);
    const untagged = snippets.filter((s) => s.tags.length === 0).sort(byName);
    return [...mine, ...untagged];
  }
  const starts: Snippet[] = [];
  const contains: Snippet[] = [];
  for (const s of snippets) {
    const name = normalize(s.name);
    if (name.startsWith(q)) starts.push(s);
    else if (name.includes(q) || normalize(s.text).includes(q)) contains.push(s);
  }
  // Dentro de cada faixa, os do fabricante do host primeiro.
  const order = (a: Snippet, b: Snippet) => Number(shared(b)) - Number(shared(a)) || byName(a, b);
  return [...starts.sort(order), ...contains.sort(order)];
}

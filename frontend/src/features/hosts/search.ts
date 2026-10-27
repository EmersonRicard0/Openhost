// Busca de hosts (FR-011): substring em rótulo, endereço, usuário, tags e nota (specs/009,
// FR-917), sem caixa nem acentos.
import type { HostView } from '@shared/model/types';

export interface SearchIndex {
  hosts: readonly HostView[];
  /** Texto normalizado por host, mesma ordem de `hosts`. */
  keys: readonly string[];
}

export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export function buildIndex(hosts: readonly HostView[]): SearchIndex {
  // Separador fora do alfabeto evita casar através de campos.
  const fields = (h: HostView) => [
    h.label,
    h.address,
    h.username,
    ...(h.tags ?? []),
    h.notes ?? '',
  ];
  return { hosts, keys: hosts.map((h) => normalize(fields(h).join('\n'))) };
}

export function filterHosts(index: SearchIndex, query: string): HostView[] {
  const q = normalize(query.trim());
  if (q === '') return [...index.hosts];
  const out: HostView[] = [];
  index.keys.forEach((key, i) => {
    const host = index.hosts[i];
    if (host && key.includes(q)) out.push(host);
  });
  return out;
}

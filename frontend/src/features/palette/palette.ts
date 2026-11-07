// Itens e filtro da paleta de comandos (FR-141).
import { normalize } from '../hosts/search';

export interface Command {
  id: string;
  label: string;
  /** Texto secundário (endereço do host, atalho); também entra na busca. */
  hint: string;
  group: 'action' | 'host' | 'snippet';
  run: () => void;
  /** Sem efeito (comando salvo sem terminal ativo); `hint` explica. */
  disabled?: boolean;
  /** Shift+Enter: comando salvo para o grupo inteiro (specs/012, US5). */
  runGroup?: () => void;
}

/** Substring sem caixa nem acento; quem começa com o texto vem primeiro, mantendo a ordem. */
export function filterCommands(items: readonly Command[], query: string): Command[] {
  const q = normalize(query.trim());
  if (q === '') return [...items];
  const starts: Command[] = [];
  const contains: Command[] = [];
  for (const item of items) {
    const label = normalize(item.label);
    if (label.startsWith(q)) starts.push(item);
    else if (label.includes(q) || normalize(item.hint).includes(q)) contains.push(item);
  }
  return [...starts, ...contains];
}

// Notas da release (Markdown de docs/release-notes) em blocos simples para mostrar como texto.

export type NoteBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

/** Tira ênfase, código e links do Markdown, deixando só o texto. */
function plain(line: string): string {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .trim();
}

/**
 * Títulos (`#`), itens de lista (`-`/`*`, com continuação indentada) e parágrafos. Tabelas e
 * blocos de código ficam de fora: são instruções de instalação, que o app já resolve.
 */
export function parseNotes(markdown: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let inCode = false;
  for (const raw of markdown.split(/\r?\n/)) {
    if (raw.trim().startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode || raw.trim().startsWith('|')) continue;
    const last = blocks[blocks.length - 1];
    const heading = /^#{1,6}\s+(.*)$/.exec(raw);
    const item = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (heading) {
      blocks.push({ kind: 'heading', text: plain(heading[1] ?? '') });
    } else if (item) {
      const text = plain(item[1] ?? '');
      if (last?.kind === 'list') last.items.push(text);
      else blocks.push({ kind: 'list', items: [text] });
    } else if (raw.trim() === '') {
      blocks.push({ kind: 'paragraph', text: '' });
    } else if (/^\s+\S/.test(raw) && last?.kind === 'list') {
      const i = last.items.length - 1;
      last.items[i] = `${last.items[i] ?? ''} ${plain(raw)}`;
    } else if (last?.kind === 'paragraph' && last.text !== '') {
      last.text = `${last.text} ${plain(raw)}`;
    } else {
      blocks.push({ kind: 'paragraph', text: plain(raw) });
    }
  }
  return blocks.filter((b) => b.kind !== 'paragraph' || b.text !== '');
}

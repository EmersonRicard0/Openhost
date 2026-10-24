// Leitura do terminal pelos testes E2E. Só existe no build com a tag e2e, que liga o TestService.
import type { Terminal } from '@xterm/xterm';

/** Os bindings do Wails já estão em `window.go` quando a primeira aba monta. */
function enabled(): boolean {
  return (window as { go?: { testsvc?: unknown } }).go?.testsvc !== undefined;
}

let installed = false;
const terminals = new Map<string, Terminal>();

export interface ProbeCell {
  chars: string;
  width: number;
  fg: 'default' | 'palette' | 'rgb';
  fgColor: number;
}

function textOf(sessionId: string): string | null {
  const term = terminals.get(sessionId);
  if (!term) return null;
  const buffer = term.buffer.active;
  const lines: string[] = [];
  for (let i = 0; i < buffer.length; i++)
    lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
  return lines.join('\n');
}

/** Última linha que contém `needle`, como índice no buffer. */
function findRow(term: Terminal, needle: string): number {
  const buffer = term.buffer.active;
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer.getLine(i)?.translateToString(true).includes(needle)) return i;
  }
  return -1;
}

/** Células da última linha que contém `needle` (cor de frente e largura). */
function cellsOf(sessionId: string, needle: string): ProbeCell[] | null {
  const term = terminals.get(sessionId);
  if (!term) return null;
  const row = findRow(term, needle);
  const line = term.buffer.active.getLine(row);
  if (!line) return null;
  const cells: ProbeCell[] = [];
  for (let x = 0; x < line.length; x++) {
    const cell = line.getCell(x);
    if (!cell || cell.getWidth() === 0) continue;
    cells.push({
      chars: cell.getChars(),
      width: cell.getWidth(),
      fg: cell.isFgRGB() ? 'rgb' : cell.isFgPalette() ? 'palette' : 'default',
      fgColor: cell.getFgColor(),
    });
  }
  return cells;
}

/** Seleciona `needle` na última linha onde aparece. */
function select(sessionId: string, needle: string): boolean {
  const term = terminals.get(sessionId);
  if (!term) return false;
  const row = findRow(term, needle);
  const col = term.buffer.active.getLine(row)?.translateToString(false).indexOf(needle) ?? -1;
  if (row < 0 || col < 0) return false;
  term.select(col, row, needle.length);
  return true;
}

export function registerProbe(sessionId: string, term: Terminal): () => void {
  if (!enabled()) return () => undefined;
  if (!installed) {
    installed = true;
    Object.defineProperty(window, '__shellvaultProbe', {
      value: Object.freeze({ text: textOf, cells: cellsOf, select }),
    });
  }
  terminals.set(sessionId, term);
  return () => {
    terminals.delete(sessionId);
  };
}

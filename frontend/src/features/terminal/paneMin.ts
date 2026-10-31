// Tamanho mínimo de um painel em pixels (research R5): 20 colunas × 5 linhas pela célula atual
// do xterm, mais o cabeçalho.
import { terminalOf } from './terminalRegistry';

/** Altura do cabeçalho de painel e o mínimo de células por painel (research R5). */
export const PANE_HEADER = 24;
const MIN_COLS = 20;
const MIN_ROWS = 5;

/** Mínimo em pixels pela célula atual do xterm de destino; sem medida, uma célula típica. */
export function paneMin(id: string): { w: number; h: number } {
  const term = terminalOf(id)?.term;
  const el = term?.element;
  if (!term || !el || term.cols <= 0 || term.rows <= 0)
    return { w: MIN_COLS * 8, h: MIN_ROWS * 17 + PANE_HEADER };
  return {
    w: (el.clientWidth / term.cols) * MIN_COLS,
    h: (el.clientHeight / term.rows) * MIN_ROWS + PANE_HEADER,
  };
}

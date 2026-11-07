// O que está sendo arrastado da barra de abas ou de um cabeçalho de painel (specs/006). Durante o
// `dragover` o navegador só expõe os tipos, não os dados: a camada de soltura lê daqui.
import { create } from 'zustand';

export interface Dragging {
  id: string;
  kind: 'session' | 'group' | 'sftp';
  /** Veio do cabeçalho de um painel (reorganizar ou separar), não da barra de abas. */
  fromPane: boolean;
}

export const useDrag = create<{ dragging: Dragging | null }>(() => ({ dragging: null }));

export function startDrag(dragging: Dragging): void {
  // Depois do `dragstart`: mudar o DOM no mesmo tique pode cancelar o arrasto no Chromium.
  setTimeout(() => {
    useDrag.setState({ dragging });
  }, 0);
}

export function endDrag(): void {
  useDrag.setState({ dragging: null });
}

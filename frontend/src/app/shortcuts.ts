// Atalhos globais (FR-140). Capturados na fase de captura da janela, antes do xterm, para não
// virarem caracteres de controle no shell; o que não é atalho segue para o terminal.

export type ShortcutAction =
  | 'newTab'
  | 'newPowerShell'
  | 'closeTab'
  | 'nextTab'
  | 'prevTab'
  | 'search'
  | 'palette'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset';

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Atalhos com Ctrl e sem Shift (`code` físico: independe do layout do teclado). */
const CTRL: Record<string, ShortcutAction> = {
  KeyT: 'newTab',
  KeyW: 'closeTab',
  Tab: 'nextTab',
  KeyK: 'palette',
  Equal: 'zoomIn',
  NumpadAdd: 'zoomIn',
  Minus: 'zoomOut',
  NumpadSubtract: 'zoomOut',
  Digit0: 'zoomReset',
  Numpad0: 'zoomReset',
};

const CTRL_SHIFT: Record<string, ShortcutAction> = {
  KeyT: 'newPowerShell',
  Tab: 'prevTab',
  KeyF: 'search',
  // Ctrl++ em teclados onde o + exige Shift.
  Equal: 'zoomIn',
};

export function matchShortcut(e: KeyLike): ShortcutAction | null {
  // Alt fora: AltGr chega como Ctrl+Alt e produz caracteres (ex.: @ no ABNT2).
  if (!e.ctrlKey || e.altKey || e.metaKey) return null;
  return (e.shiftKey ? CTRL_SHIFT : CTRL)[e.code] ?? null;
}

/** Instala os atalhos na janela; devolve a função que os remove. */
export function installShortcuts(run: (action: ShortcutAction, repeat: boolean) => void) {
  const onKeyDown = (e: KeyboardEvent) => {
    const action = matchShortcut(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    run(action, e.repeat);
  };
  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
  };
}

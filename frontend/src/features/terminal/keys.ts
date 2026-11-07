// Teclas de copiar e colar do terminal por sistema (FR-143, specs/004 FR-409):
// - Windows: Ctrl+Shift+C/V; Ctrl+C copia só com texto selecionado (sem seleção vai o ^C para o
//   programa); Ctrl+V cola, como no Terminal do Windows.
// - Linux: Ctrl+Shift+C/V.
// - Windows e Linux: Ctrl+Insert copia e Shift+Insert cola.
// - macOS: ⌘C/⌘V, e toda combinação com ⌃ segue para o programa.
import type { Platform } from '@shared/model/types';

export interface TerminalKey {
  type: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/**
 * `copy`: o app copia a seleção; `paste`: o app lê a área de transferência e cola (passando pela
 * confirmação de várias linhas); `terminal`: segue para o xterm.
 */
export type TerminalKeyAction = 'copy' | 'paste' | 'terminal';

export function terminalKeyAction(
  e: TerminalKey,
  platform: Platform,
  hasSelection = false,
): TerminalKeyAction {
  if (e.type !== 'keydown') return 'terminal';
  if (platform === 'darwin') {
    if (!(e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey)) return 'terminal';
    if (e.code === 'KeyC') return 'copy';
    if (e.code === 'KeyV') return 'paste';
    return 'terminal';
  }
  if (e.altKey || e.metaKey) return 'terminal';
  if (e.code === 'Insert') {
    if (e.ctrlKey && !e.shiftKey) return 'copy';
    if (e.shiftKey && !e.ctrlKey) return 'paste';
    return 'terminal';
  }
  if (!e.ctrlKey) return 'terminal';
  if (e.shiftKey) {
    if (e.code === 'KeyC') return 'copy';
    if (e.code === 'KeyV') return 'paste';
    return 'terminal';
  }
  if (platform === 'windows') {
    if (e.code === 'KeyC' && hasSelection) return 'copy';
    if (e.code === 'KeyV') return 'paste';
  }
  return 'terminal';
}

/** Modificador do clique que abre um link do terminal no navegador (FR-145). */
export function opensLink(e: { ctrlKey: boolean; metaKey: boolean }, platform: Platform): boolean {
  return platform === 'darwin' ? e.metaKey : e.ctrlKey;
}

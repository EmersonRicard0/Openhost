// Teclas de copiar e colar do terminal por sistema (FR-143, specs/004 FR-409): Ctrl+Shift+C/V no
// Windows e no Linux; ⌘C/⌘V no macOS, onde toda combinação com ⌃ segue para o programa.
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
 * `copy`: o app copia a seleção; `paste`: o xterm ignora e a colagem nativa chega pelo evento
 * `paste` (que passa pela confirmação); `terminal`: segue para o xterm.
 */
export type TerminalKeyAction = 'copy' | 'paste' | 'terminal';

export function terminalKeyAction(e: TerminalKey, platform: Platform): TerminalKeyAction {
  if (e.type !== 'keydown') return 'terminal';
  const mac = platform === 'darwin';
  const chord = mac
    ? e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
    : e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey;
  if (!chord) return 'terminal';
  if (e.code === 'KeyC') return 'copy';
  if (e.code === 'KeyV') return 'paste';
  return 'terminal';
}

/** Modificador do clique que abre um link do terminal no navegador (FR-145). */
export function opensLink(e: { ctrlKey: boolean; metaKey: boolean }, platform: Platform): boolean {
  return platform === 'darwin' ? e.metaKey : e.ctrlKey;
}

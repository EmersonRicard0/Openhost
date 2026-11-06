import { describe, expect, it } from 'vitest';
import { opensLink, terminalKeyAction, type TerminalKey } from './keys';

const key = (code: string, mods: Partial<TerminalKey> = {}): TerminalKey => ({
  type: 'keydown',
  code,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe('copiar e colar no terminal', () => {
  it('Windows e Linux: Ctrl+Shift+C/V', () => {
    for (const p of ['windows', 'linux'] as const) {
      expect(terminalKeyAction(key('KeyC', { ctrlKey: true, shiftKey: true }), p)).toBe('copy');
      expect(terminalKeyAction(key('KeyV', { ctrlKey: true, shiftKey: true }), p)).toBe('paste');
      expect(terminalKeyAction(key('KeyC', { ctrlKey: true }), p)).toBe('terminal');
    }
  });

  it('Windows: Ctrl+C copia só com seleção; Ctrl+V cola', () => {
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true }), 'windows', true)).toBe('copy');
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true }), 'windows', false)).toBe('terminal');
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true }), 'windows')).toBe('paste');
    // No Linux, Ctrl+C e Ctrl+V continuam com o programa.
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true }), 'linux', true)).toBe('terminal');
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true }), 'linux')).toBe('terminal');
  });

  it('Windows e Linux: Ctrl+Insert copia, Shift+Insert cola', () => {
    for (const p of ['windows', 'linux'] as const) {
      expect(terminalKeyAction(key('Insert', { ctrlKey: true }), p)).toBe('copy');
      expect(terminalKeyAction(key('Insert', { shiftKey: true }), p)).toBe('paste');
      expect(terminalKeyAction(key('Insert'), p)).toBe('terminal');
    }
  });

  it('macOS: ⌘C/⌘V; ⌃C, ⌃V e ⌃⇧C seguem para o programa', () => {
    expect(terminalKeyAction(key('KeyC', { metaKey: true }), 'darwin')).toBe('copy');
    expect(terminalKeyAction(key('KeyV', { metaKey: true }), 'darwin')).toBe('paste');
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true }), 'darwin')).toBe('terminal');
    expect(terminalKeyAction(key('KeyV', { ctrlKey: true }), 'darwin')).toBe('terminal');
    expect(terminalKeyAction(key('KeyC', { ctrlKey: true, shiftKey: true }), 'darwin')).toBe(
      'terminal',
    );
  });

  it('só no keydown', () => {
    expect(terminalKeyAction({ ...key('KeyC', { metaKey: true }), type: 'keyup' }, 'darwin')).toBe(
      'terminal',
    );
  });

  it('link abre com Ctrl+clique, ou ⌘-clique no macOS', () => {
    expect(opensLink({ ctrlKey: true, metaKey: false }, 'windows')).toBe(true);
    expect(opensLink({ ctrlKey: true, metaKey: false }, 'darwin')).toBe(false);
    expect(opensLink({ ctrlKey: false, metaKey: true }, 'darwin')).toBe(true);
  });
});

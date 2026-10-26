import { describe, expect, it } from 'vitest';
import {
  buildKeymap,
  comboLabel,
  comboOf,
  conflictOf,
  matchShortcut,
  stealsFromTerminal,
  type KeyLike,
} from './shortcuts';

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});
const shift = { shiftKey: true };

describe('matchShortcut (FR-173)', () => {
  it.each([
    [key('KeyT', shift), 'newTab'],
    [key('KeyW', shift), 'closeTab'],
    [key('Tab'), 'nextTab'],
    [key('Tab', shift), 'prevTab'],
    [key('KeyF', shift), 'search'],
    [key('KeyP', shift), 'palette'],
    [key('KeyB', shift), 'toggleSidebar'],
    [key('Equal'), 'zoomIn'],
    [key('Equal', shift), 'zoomIn'],
    [key('NumpadAdd'), 'zoomIn'],
    [key('Minus'), 'zoomOut'],
    [key('NumpadSubtract'), 'zoomOut'],
    [key('Digit0'), 'zoomReset'],
    [key('Numpad0'), 'zoomReset'],
  ] as const)('%o → %s', (event, action) => {
    expect(matchShortcut(event)).toBe(action);
  });

  it('deixa as teclas do readline e do tmux para o terminal', () => {
    for (const code of ['KeyW', 'KeyK', 'KeyT', 'KeyB', 'KeyC', 'KeyF']) {
      expect(matchShortcut(key(code))).toBeNull();
    }
    expect(matchShortcut(key('KeyT', { ctrlKey: false, shiftKey: true }))).toBeNull();
    expect(matchShortcut(key('KeyT', { altKey: true, shiftKey: true }))).toBeNull(); // AltGr
    expect(matchShortcut(key('KeyP', { metaKey: true, shiftKey: true }))).toBeNull();
  });

  it('usa o mapa do usuário: remapear e desativar', () => {
    const keymap = buildKeymap({ closeTab: 'Ctrl+Alt+W', palette: '' });
    expect(matchShortcut(key('KeyW', { altKey: true }), keymap)).toBe('closeTab');
    expect(matchShortcut(key('KeyW', shift), keymap)).toBeNull();
    expect(matchShortcut(key('KeyP', shift), keymap)).toBeNull();
    expect(matchShortcut(key('KeyT', shift), keymap)).toBe('newTab');
  });
});

describe('gravação de atalhos', () => {
  it('monta a combinação na ordem Ctrl+Alt+Shift', () => {
    expect(comboOf(key('KeyT', { shiftKey: true, altKey: true }))).toBe('Ctrl+Alt+Shift+T');
    expect(comboOf(key('F5', { ctrlKey: false }))).toBe('F5');
    expect(comboOf(key('ShiftLeft', shift))).toBeNull();
  });

  it('acha conflito com outra ação', () => {
    expect(conflictOf('Ctrl+Shift+W', 'newTab', {})).toBe('closeTab');
    expect(conflictOf('Ctrl+Shift+W', 'closeTab', {})).toBeNull();
    expect(conflictOf('Ctrl+Shift+W', 'newTab', { closeTab: '' })).toBeNull();
  });

  it('avisa quando a combinação tira uma tecla do terminal', () => {
    expect(stealsFromTerminal('Ctrl+W')).toBe(true);
    expect(stealsFromTerminal('Ctrl+Alt+W')).toBe(true);
    expect(stealsFromTerminal('Ctrl+Shift+W')).toBe(false);
    expect(stealsFromTerminal('Ctrl+Tab')).toBe(false);
  });

  it('mostra rótulos legíveis', () => {
    expect(comboLabel('Ctrl+Digit0')).toBe('Ctrl+0');
    expect(comboLabel('Ctrl+Equal')).toBe('Ctrl+=');
    expect(comboLabel('Ctrl+Shift+T')).toBe('Ctrl+Shift+T');
  });
});

describe('macOS (specs/004, contracts/platform.md)', () => {
  const mac = buildKeymap({}, 'darwin');
  const cmd = (code: string, mods: Partial<KeyLike> = {}): KeyLike =>
    key(code, { ctrlKey: false, metaKey: true, ...mods });

  it.each([
    [cmd('KeyT'), 'newTab'],
    [cmd('KeyW'), 'closeTab'],
    [cmd('BracketRight', shift), 'nextTab'],
    [cmd('BracketLeft', shift), 'prevTab'],
    [key('Tab'), 'nextTab'],
    [key('Tab', shift), 'prevTab'],
    [cmd('KeyP', shift), 'palette'],
    [cmd('KeyF'), 'search'],
    [cmd('KeyB'), 'toggleSidebar'],
    [cmd('Equal'), 'zoomIn'],
    [cmd('Minus'), 'zoomOut'],
    [cmd('Digit0'), 'zoomReset'],
  ] as const)('%o → %s', (event, action) => {
    expect(matchShortcut(event, mac)).toBe(action);
  });

  it('não captura nenhuma combinação com ⌃ além de ⌃Tab', () => {
    for (const [combo] of mac) {
      if (combo.split('+').includes('Ctrl')) expect(combo.endsWith('+Tab')).toBe(true);
    }
    expect(matchShortcut(key('KeyT', shift), mac)).toBeNull();
    expect(matchShortcut(key('KeyC'), mac)).toBeNull();
  });

  it('grava ⌘ na combinação só no macOS', () => {
    expect(comboOf(cmd('KeyK', shift), 'darwin')).toBe('Shift+Meta+K');
    expect(comboOf(cmd('KeyK', shift))).toBeNull();
  });

  it('⌃ com letra tira a tecla do terminal; ⌘ nunca', () => {
    expect(stealsFromTerminal('Ctrl+Shift+R', 'darwin')).toBe(true);
    expect(stealsFromTerminal('Ctrl+R', 'darwin')).toBe(true);
    expect(stealsFromTerminal('Meta+R', 'darwin')).toBe(false);
    expect(stealsFromTerminal('Ctrl+Shift+R')).toBe(false);
  });

  it('mostra os símbolos do Mac sem "+"', () => {
    expect(comboLabel('Shift+Meta+T', 'darwin')).toBe('⇧⌘T');
    expect(comboLabel('Ctrl+Alt+Shift+Meta+Digit0', 'darwin')).toBe('⌃⌥⇧⌘0');
    expect(comboLabel('Meta+Equal', 'darwin')).toBe('⌘=');
    expect(comboLabel('Ctrl+Shift+T')).toBe('Ctrl+Shift+T');
  });

  it('overrides gravados ficam literais', () => {
    const keymap = buildKeymap({ newTab: 'Ctrl+Shift+T' }, 'darwin');
    expect(matchShortcut(key('KeyT', shift), keymap)).toBe('newTab');
    expect(matchShortcut(cmd('KeyT'), keymap)).toBeNull();
  });

  it('conflito considera a tabela do macOS', () => {
    expect(conflictOf('Meta+F', 'palette', {}, 'darwin')).toBe('search');
    expect(conflictOf('Meta+F', 'palette', {})).toBeNull();
  });
});

describe('abrir as configurações', () => {
  it('Ctrl+, no Windows e no Linux; ⌘, no macOS', () => {
    expect(matchShortcut(key('Comma'))).toBe('openSettings');
    const mac = buildKeymap({}, 'darwin');
    expect(matchShortcut(key('Comma', { ctrlKey: false, metaKey: true }), mac)).toBe(
      'openSettings',
    );
    expect(comboLabel('Meta+Comma', 'darwin')).toBe('⌘,');
  });
});

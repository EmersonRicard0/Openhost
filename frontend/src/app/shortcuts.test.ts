import { describe, expect, it } from 'vitest';
import { matchShortcut, type KeyLike } from './shortcuts';

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({
  code,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...mods,
});

describe('matchShortcut (FR-140)', () => {
  it.each([
    [key('KeyT'), 'newTab'],
    [key('KeyT', { shiftKey: true }), 'newPowerShell'],
    [key('KeyW'), 'closeTab'],
    [key('Tab'), 'nextTab'],
    [key('Tab', { shiftKey: true }), 'prevTab'],
    [key('KeyF', { shiftKey: true }), 'search'],
    [key('KeyK'), 'palette'],
    [key('KeyB'), 'toggleSidebar'],
    [key('Equal'), 'zoomIn'],
    [key('Equal', { shiftKey: true }), 'zoomIn'],
    [key('NumpadAdd'), 'zoomIn'],
    [key('Minus'), 'zoomOut'],
    [key('NumpadSubtract'), 'zoomOut'],
    [key('Digit0'), 'zoomReset'],
    [key('Numpad0'), 'zoomReset'],
  ] as const)('%o → %s', (event, action) => {
    expect(matchShortcut(event)).toBe(action);
  });

  it('deixa passar para o terminal o que não é atalho', () => {
    expect(matchShortcut(key('KeyC'))).toBeNull(); // Ctrl+C é do shell
    expect(matchShortcut(key('KeyF'))).toBeNull(); // Ctrl+F sem Shift também
    expect(matchShortcut(key('KeyT', { ctrlKey: false }))).toBeNull();
    expect(matchShortcut(key('KeyT', { altKey: true }))).toBeNull(); // AltGr = Ctrl+Alt
    expect(matchShortcut(key('KeyK', { metaKey: true }))).toBeNull();
    expect(matchShortcut(key('KeyW', { shiftKey: true }))).toBeNull();
  });
});

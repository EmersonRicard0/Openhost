// Atalhos globais (FR-140, FR-173). Capturados na fase de captura da janela, antes do xterm, para
// não virarem caracteres de controle no shell; o que não é atalho segue para o terminal.
// Padrão em Ctrl+Shift: Ctrl+W, Ctrl+K, Ctrl+T e Ctrl+B pertencem ao readline e ao tmux.
// No macOS o padrão é ⌘ (Meta), que nunca chega ao terminal; ⌃ fica todo para o shell (specs/004).

import type { Platform } from '@shared/model/types';

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
  | 'zoomReset'
  | 'toggleSidebar'
  | 'openSettings'
  | 'focusLeft'
  | 'focusRight'
  | 'focusUp'
  | 'focusDown';

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Combinação como texto: modificadores na ordem Ctrl+Alt+Shift+Meta e o `code` físico sem `Key`. */
export type Combo = string;

/** Mapa gravado nas preferências: só as ações alteradas; `""` = desativado. */
export type ShortcutOverrides = Partial<Record<ShortcutAction, Combo>>;

export const ACTIONS: readonly ShortcutAction[] = [
  'newTab',
  'newPowerShell',
  'closeTab',
  'nextTab',
  'prevTab',
  'palette',
  'search',
  'toggleSidebar',
  'openSettings',
  'zoomIn',
  'zoomOut',
  'zoomReset',
  'focusLeft',
  'focusRight',
  'focusUp',
  'focusDown',
];

/** Ações que existem no sistema: "Novo terminal PowerShell" só no Windows. */
export function actionsFor(platform: Platform = 'windows'): readonly ShortcutAction[] {
  return platform === 'windows' ? ACTIONS : ACTIONS.filter((a) => a !== 'newPowerShell');
}

/** Padrões no Windows e no Linux; o primeiro de cada lista é o que aparece nas dicas. */
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, readonly Combo[]> = {
  newTab: ['Ctrl+Shift+T'],
  newPowerShell: [],
  closeTab: ['Ctrl+Shift+W'],
  nextTab: ['Ctrl+Tab'],
  prevTab: ['Ctrl+Shift+Tab'],
  palette: ['Ctrl+Shift+P'],
  search: ['Ctrl+Shift+F'],
  toggleSidebar: ['Ctrl+Shift+B'],
  openSettings: ['Ctrl+Comma'],
  // Ctrl+Shift+= para teclados em que o + exige Shift.
  zoomIn: ['Ctrl+Equal', 'Ctrl+NumpadAdd', 'Ctrl+Shift+Equal'],
  zoomOut: ['Ctrl+Minus', 'Ctrl+NumpadSubtract'],
  zoomReset: ['Ctrl+Digit0', 'Ctrl+Numpad0'],
  // Painéis de um grupo (specs/006, research R6): Alt+Seta e Ctrl+Shift+Seta são do shell.
  focusLeft: ['Ctrl+Alt+ArrowLeft'],
  focusRight: ['Ctrl+Alt+ArrowRight'],
  focusUp: ['Ctrl+Alt+ArrowUp'],
  focusDown: ['Ctrl+Alt+ArrowDown'],
};

/** Padrões do macOS (contracts/platform.md): ⌘ no lugar de Ctrl+Shift; ⌃Tab continua. */
export const MAC_DEFAULT_SHORTCUTS: Record<ShortcutAction, readonly Combo[]> = {
  newTab: ['Meta+T'],
  newPowerShell: [],
  closeTab: ['Meta+W'],
  nextTab: ['Shift+Meta+BracketRight', 'Ctrl+Tab'],
  prevTab: ['Shift+Meta+BracketLeft', 'Ctrl+Shift+Tab'],
  palette: ['Shift+Meta+P'],
  search: ['Meta+F'],
  toggleSidebar: ['Meta+B'],
  openSettings: ['Meta+Comma'],
  zoomIn: ['Meta+Equal', 'Shift+Meta+Equal', 'Meta+NumpadAdd'],
  zoomOut: ['Meta+Minus', 'Meta+NumpadSubtract'],
  zoomReset: ['Meta+Digit0', 'Meta+Numpad0'],
  focusLeft: ['Alt+Meta+ArrowLeft'],
  focusRight: ['Alt+Meta+ArrowRight'],
  focusUp: ['Alt+Meta+ArrowUp'],
  focusDown: ['Alt+Meta+ArrowDown'],
};

export function defaultShortcuts(platform: Platform = 'windows') {
  return platform === 'darwin' ? MAC_DEFAULT_SHORTCUTS : DEFAULT_SHORTCUTS;
}

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
]);

/**
 * Combinação de um evento, ou null para tecla de modificador sozinha. A tecla Windows/Super é
 * do sistema; só no macOS ⌘ entra na combinação.
 */
export function comboOf(e: KeyLike, platform: Platform = 'windows'): Combo | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  if (e.metaKey && platform !== 'darwin') return null;
  const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', key]
    .filter(Boolean)
    .join('+');
}

/** Combinações efetivas de cada ação: o valor do usuário substitui todos os padrões. */
export function effectiveShortcuts(
  overrides: ShortcutOverrides = {},
  platform: Platform = 'windows',
): Record<ShortcutAction, readonly Combo[]> {
  const out = { ...defaultShortcuts(platform) };
  for (const action of ACTIONS) {
    const custom = overrides[action];
    if (custom !== undefined) out[action] = custom === '' ? [] : [custom];
  }
  return out;
}

export function buildKeymap(
  overrides: ShortcutOverrides = {},
  platform: Platform = 'windows',
): Map<Combo, ShortcutAction> {
  const map = new Map<Combo, ShortcutAction>();
  const effective = effectiveShortcuts(overrides, platform);
  for (const action of ACTIONS) {
    for (const combo of effective[action]) if (!map.has(combo)) map.set(combo, action);
  }
  return map;
}

export function matchShortcut(e: KeyLike, keymap = buildKeymap()): ShortcutAction | null {
  // ⌘ só aparece em mapas do macOS; nos outros a combinação com Meta nunca casa.
  const combo = comboOf(e, 'darwin');
  return combo ? (keymap.get(combo) ?? null) : null;
}

/** Ação que já usa a combinação (para recusar conflito), exceto a própria. */
export function conflictOf(
  combo: Combo,
  action: ShortcutAction,
  overrides: ShortcutOverrides,
  platform: Platform = 'windows',
): ShortcutAction | null {
  const effective = effectiveShortcuts(overrides, platform);
  return ACTIONS.find((a) => a !== action && effective[a].includes(combo)) ?? null;
}

/**
 * Combinação que tira uma tecla do terminal: Ctrl ou Ctrl+Alt (AltGr) sem Shift. No macOS toda
 * combinação com ⌃ e letra é do terminal (o app usa ⌘).
 */
export function stealsFromTerminal(combo: Combo, platform: Platform = 'windows'): boolean {
  const parts = combo.split('+');
  const key = parts[parts.length - 1] ?? '';
  if (!parts.includes('Ctrl') || !/^[A-Z]$/.test(key)) return false;
  return platform === 'darwin' || !parts.includes('Shift');
}

const KEY_LABELS: Record<string, string> = {
  Equal: '=',
  Minus: '−',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num −',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backslash: '\\',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

const MAC_MODIFIERS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' };

function keyLabel(part: string): string {
  if (part.startsWith('Digit')) return part.slice(5);
  if (part.startsWith('Numpad') && /\d$/.test(part)) return `Num ${part.slice(6)}`;
  return KEY_LABELS[part] ?? part;
}

/** Texto para a interface: `Ctrl+Digit0` → `Ctrl+0`; no macOS `Shift+Meta+T` → `⇧⌘T`. */
export function comboLabel(combo: Combo, platform: Platform = 'windows'): string {
  const parts = combo.split('+');
  if (platform === 'darwin') return parts.map((p) => MAC_MODIFIERS[p] ?? keyLabel(p)).join('');
  return parts.map(keyLabel).join('+');
}

/** Instala os atalhos na janela; `keymap` é lido a cada tecla (muda nas configurações). */
export function installShortcuts(
  run: (action: ShortcutAction, repeat: boolean) => void,
  keymap: () => Map<Combo, ShortcutAction> = () => buildKeymap(),
) {
  const onKeyDown = (e: KeyboardEvent) => {
    // Gravando um atalho nas configurações: a tecla é para o gravador.
    if (e.target instanceof Element && e.target.closest('[data-shortcut-recorder]')) return;
    const action = matchShortcut(e, keymap());
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

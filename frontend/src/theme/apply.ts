import type { Appearance, ThemePreference } from '@shared/model/types';
import { THEMES, type ThemeMode, type ThemeTokens } from './tokens';

export function resolveMode(appearance: Appearance, preference: ThemePreference): ThemeMode {
  if (appearance.highContrast) return 'high-contrast';
  const dark = preference === 'system' ? appearance.dark : preference === 'dark';
  if (appearance.glass) return dark ? 'glass-dark' : 'glass-light';
  return dark ? 'solid-dark' : 'solid-light';
}

function cssName(key: string): string {
  return `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Escreve os tokens como variáveis CSS em :root e retorna os valores aplicados. */
export function applyTheme(appearance: Appearance, preference: ThemePreference): ThemeTokens {
  const mode = resolveMode(appearance, preference);
  const tokens = THEMES[mode];
  const root = document.documentElement;
  for (const key of Object.keys(tokens) as (keyof ThemeTokens)[]) {
    root.style.setProperty(cssName(key), tokens[key]);
  }
  root.dataset.mode = mode;
  root.style.colorScheme = mode.endsWith('light') ? 'light' : 'dark';
  return tokens;
}

import { create } from 'zustand';
import type { Appearance, Settings } from '@shared/model/types';
import { applyTheme, resolveMode } from '../theme/apply';
import { THEMES, type ThemeTokens } from '../theme/tokens';

interface UiState {
  appearance: Appearance;
  settings: Settings | null;
  tokens: ThemeTokens;
  /** Tema efetivo escuro (preferência do usuário ou do Windows). */
  dark: boolean;
  setAppearance: (a: Appearance) => void;
  setSettings: (s: Settings) => void;
}

const initialAppearance: Appearance = { glass: false, highContrast: false, dark: true };

function derive(appearance: Appearance, settings: Settings | null) {
  const preference = settings?.theme ?? 'system';
  return {
    tokens: applyTheme(appearance, preference),
    dark: !resolveMode(appearance, preference).endsWith('light'),
  };
}

export const useUi = create<UiState>((set, get) => ({
  appearance: initialAppearance,
  settings: null,
  tokens: THEMES['solid-dark'],
  dark: true,
  setAppearance(appearance) {
    set({ appearance, ...derive(appearance, get().settings) });
  },
  setSettings(settings) {
    set({ settings, ...derive(get().appearance, settings) });
  },
}));

export async function loadUi(): Promise<void> {
  const api = window.shellvault.app;
  const [appearance, settings] = await Promise.all([api.getAppearance(), api.getUiSettings()]);
  if (settings.ok) useUi.getState().setSettings(settings.value);
  if (appearance.ok) useUi.getState().setAppearance(appearance.value);
  api.onAppearanceChanged((a) => {
    useUi.getState().setAppearance(a);
  });
}

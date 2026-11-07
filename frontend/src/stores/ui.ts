import { create } from 'zustand';
import type { Appearance, Platform, Settings } from '@shared/model/types';
import { applyTheme, resolveMode } from '../theme/apply';
import { THEMES, type ThemeTokens } from '../theme/tokens';
import { useShells } from './shells';

interface UiState {
  /** Sistema em que o app roda; decide barra de título, atalhos e opções (specs/004). */
  platform: Platform;
  appearance: Appearance;
  settings: Settings | null;
  tokens: ThemeTokens;
  /** Tema efetivo escuro (preferência do usuário ou do sistema). */
  dark: boolean;
  setPlatform: (p: Platform) => void;
  setAppearance: (a: Appearance) => void;
  setSettings: (s: Settings) => void;
}

const initialAppearance: Appearance = {
  glass: false,
  highContrast: false,
  dark: true,
  systemAccent: null,
};

function derive(appearance: Appearance, settings: Settings | null) {
  const preference = settings?.theme ?? 'system';
  return {
    tokens: applyTheme(appearance, preference, settings?.accent),
    dark: !resolveMode(appearance, preference).endsWith('light'),
  };
}

export const useUi = create<UiState>((set, get) => ({
  platform: 'windows',
  appearance: initialAppearance,
  settings: null,
  tokens: THEMES['solid-dark'],
  dark: true,
  setPlatform(platform) {
    set({ platform });
  },
  setAppearance(appearance) {
    set({ appearance, ...derive(appearance, get().settings) });
  },
  setSettings(settings) {
    set({ settings, ...derive(get().appearance, settings) });
  },
}));

export async function loadUi(): Promise<void> {
  const api = window.shellvault.app;
  // A plataforma vem antes: a lista de shells de reserva depende dela.
  const platform = await api.getPlatform();
  if (platform.ok) useUi.getState().setPlatform(platform.value);
  const [appearance, settings] = await Promise.all([
    api.getAppearance(),
    api.getUiSettings(),
    useShells.getState().load(useUi.getState().platform),
  ]);
  if (settings.ok) useUi.getState().setSettings(settings.value);
  if (appearance.ok) useUi.getState().setAppearance(appearance.value);
  api.onAppearanceChanged((a) => {
    useUi.getState().setAppearance(a);
  });
  // Só no build e2e (TestService ligado): o teste de aparência força o modo que viria do Windows.
  if ((window as { go?: { testsvc?: unknown } }).go?.testsvc !== undefined) {
    (window as { __setAppearance?: (a: Partial<Appearance>) => void }).__setAppearance = (a) => {
      useUi.getState().setAppearance({ ...useUi.getState().appearance, ...a });
    };
  }
}

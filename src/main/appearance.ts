// Vidro (acrílico do Windows 11) com fallback sólido automático (FR-031, FR-033; research R8).
import { release } from 'node:os';
import { nativeTheme, type BrowserWindow } from 'electron';
import type { Appearance } from '@shared/model/types';
import { testHooks } from './testHooks';

/** Windows 11 22H2: primeira versão com `backgroundMaterial` acrílico estável. */
const MIN_ACRYLIC_BUILD = 22621;

export interface AppearanceInputs {
  platform: NodeJS.Platform;
  osRelease: string;
  reducedTransparency: boolean;
  highContrast: boolean;
  dark: boolean;
  forceSolid: boolean;
}

export function computeAppearance(i: AppearanceInputs): Appearance {
  const build = Number(i.osRelease.split('.')[2] ?? 0);
  const supportsAcrylic = i.platform === 'win32' && build >= MIN_ACRYLIC_BUILD;
  return {
    glass: supportsAcrylic && !i.reducedTransparency && !i.highContrast && !i.forceSolid,
    highContrast: i.highContrast,
    dark: i.dark,
  };
}

export function currentAppearance(): Appearance {
  return computeAppearance({
    platform: process.platform,
    osRelease: release(),
    reducedTransparency: nativeTheme.prefersReducedTransparency,
    highContrast: nativeTheme.shouldUseHighContrastColors,
    dark: nativeTheme.shouldUseDarkColors,
    forceSolid: testHooks.forceSolid,
  });
}

export const SOLID_BACKGROUND = { dark: '#14161e', light: '#f2f3f8' } as const;

export function applyAppearance(win: BrowserWindow, a: Appearance): void {
  if (a.glass) {
    win.setBackgroundColor('#00000000');
    win.setBackgroundMaterial('acrylic');
  } else {
    win.setBackgroundMaterial('none');
    win.setBackgroundColor(a.dark ? SOLID_BACKGROUND.dark : SOLID_BACKGROUND.light);
  }
}

/** Reaplica e notifica quando o Windows muda tema, transparência ou alto contraste. */
export function watchAppearance(win: BrowserWindow, onChange: (a: Appearance) => void): () => void {
  const listener = () => {
    const a = currentAppearance();
    applyAppearance(win, a);
    onChange(a);
  };
  nativeTheme.on('updated', listener);
  return () => nativeTheme.off('updated', listener);
}

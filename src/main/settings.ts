// Preferências não sensíveis em settings.json (research R12). Nunca guarda segredos.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Settings, WindowBounds } from '@shared/model/types';
import { writeFileAtomic } from './fs/atomic';

const windowSchema = z.object({
  width: z.number().int().min(400).max(10_000),
  height: z.number().int().min(300).max(10_000),
  x: z.number().int().nullable(),
  y: z.number().int().nullable(),
  maximized: z.boolean(),
});

export const settingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']),
  terminalFontFamily: z.string().trim().min(1).max(200),
  terminalFontSize: z.number().int().min(8).max(32),
  window: windowSchema,
});

export const uiSettingsPatchSchema = settingsSchema.omit({ window: true }).partial().strict();

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  terminalFontFamily: 'Cascadia Mono, Consolas, monospace',
  terminalFontSize: 14,
  window: { width: 1200, height: 780, x: null, y: null, maximized: false },
};

export class SettingsStore {
  private constructor(
    private readonly path: string,
    private current: Settings,
  ) {}

  static load(dataDir: string): SettingsStore {
    const path = join(dataDir, 'settings.json');
    let current = DEFAULT_SETTINGS;
    try {
      const parsed = settingsSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
      if (parsed.success) current = parsed.data;
    } catch {
      // Ausente ou ilegível: ficam os padrões (não é dado sensível).
    }
    return new SettingsStore(path, current);
  }

  get(): Settings {
    return this.current;
  }

  update(patch: Partial<Omit<Settings, 'window'>>): Settings {
    this.current = settingsSchema.parse({ ...this.current, ...uiSettingsPatchSchema.parse(patch) });
    this.save();
    return this.current;
  }

  saveWindow(bounds: WindowBounds): void {
    const parsed = windowSchema.safeParse(bounds);
    if (!parsed.success) return;
    this.current = { ...this.current, window: parsed.data };
    this.save();
  }

  private save(): void {
    writeFileAtomic(this.path, JSON.stringify(this.current, null, 2));
  }
}

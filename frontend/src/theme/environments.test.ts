import { describe, expect, it } from 'vitest';
import { contrast, parseColor } from './color';
import { ENVIRONMENT_COLORS, environmentColor } from './environments';
import { SOLID_MODES, THEMES } from './tokens';

// Faixa da aba e borda do terminal precisam de 3:1 (WCAG 1.4.11) contra o que fica atrás delas.
describe('cores de ambiente (009, FR-902)', () => {
  describe.each(SOLID_MODES)('%s', (mode) => {
    const t = THEMES[mode];
    const dark = mode.endsWith('dark');
    it.each(ENVIRONMENT_COLORS)('%s contrasta com a barra de abas e o terminal', (color) => {
      const value = parseColor(environmentColor(color, dark));
      for (const bg of [t.surfaceGlass, t.surfaceRaised, t.terminalBackground]) {
        expect(contrast(value, parseColor(bg))).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

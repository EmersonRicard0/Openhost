import { describe, expect, it } from 'vitest';
import type { ImportSource, SourceKind } from '@shared/model/types';
import { visibleCards } from './ImportExportPage';

const src = (kind: SourceKind, available: boolean): ImportSource => ({
  kind,
  available,
  defaultFound: false,
});

const others = (['openssh', 'csv', 'mobaxterm', 'securecrt', 'openhost'] as const).map((k) =>
  src(k, true),
);

describe('cartões de origem por sistema', () => {
  it('Windows: PuTTY e KiTTY aparecem', () => {
    const cards = visibleCards([
      ...others,
      src('putty', true),
      src('kitty', true),
      src('kittyPortable', true),
    ]);
    expect(cards).toContain('putty');
    expect(cards).toContain('kitty');
  });

  it('Linux e macOS: PuTTY some; KiTTY fica pela pasta portátil', () => {
    const cards = visibleCards([
      ...others,
      src('putty', false),
      src('kitty', false),
      src('kittyPortable', true),
    ]);
    expect(cards).not.toContain('putty');
    expect(cards).toContain('kitty');
    expect(cards).toContain('openssh');
  });

  it('antes da resposta mostra todos', () => {
    expect(visibleCards([])).toHaveLength(7);
  });
});

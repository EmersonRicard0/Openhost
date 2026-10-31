import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '@shared/model/types';
import { loadUi, useUi } from './ui';

function install(platform: { ok: true; value: Platform } | { ok: false; error: unknown }) {
  const ok = <T>(value: T) => Promise.resolve({ ok: true, value });
  const fail = Promise.resolve({ ok: false, error: { code: 'INTERNAL' } });
  Object.assign(globalThis, {
    window: {
      shellvault: {
        app: {
          getPlatform: () => Promise.resolve(platform),
          // Sem aparência nem preferências: o tema mexe no DOM, que o ambiente `node` não tem.
          getAppearance: () => fail,
          getUiSettings: () => fail,
          listLocalShells: () => ok([]),
          onAppearanceChanged: vi.fn(),
        },
      },
    },
  });
}

describe('plataforma', () => {
  beforeEach(() => {
    useUi.setState({ platform: 'windows' });
  });

  it('começa como Windows até a ponte responder', () => {
    expect(useUi.getState().platform).toBe('windows');
  });

  it.each<Platform>(['linux', 'darwin', 'windows'])('guarda %s lido da ponte', async (p) => {
    install({ ok: true, value: p });
    await loadUi();
    expect(useUi.getState().platform).toBe(p);
  });

  it('falha ao ler mantém o padrão do Windows', async () => {
    install({ ok: false, error: { code: 'INTERNAL' } });
    await loadUi();
    expect(useUi.getState().platform).toBe('windows');
  });
});

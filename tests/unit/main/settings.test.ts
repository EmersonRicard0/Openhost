import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore } from '../../../src/main/settings';

describe('SettingsStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sv-settings-'));
  });

  it('usa os padrões quando o arquivo não existe', () => {
    const store = SettingsStore.load(dir);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      theme: 'system',
      terminalFontFamily: 'Cascadia Mono, Consolas, monospace',
      terminalFontSize: 14,
      window: { width: 1200, height: 780 },
    });
  });

  it('usa os padrões quando o arquivo é inválido', () => {
    writeFileSync(join(dir, 'settings.json'), '{ isto não é json');
    expect(SettingsStore.load(dir).get()).toEqual(DEFAULT_SETTINGS);
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'roxo' }));
    expect(SettingsStore.load(dir).get()).toEqual(DEFAULT_SETTINGS);
  });

  it.each([7, 33, 14.5])('rejeita terminalFontSize %s', (size) => {
    const store = SettingsStore.load(dir);
    expect(() => store.update({ terminalFontSize: size })).toThrow();
    expect(store.get().terminalFontSize).toBe(14);
  });

  it('preserva campos ao aplicar patch e grava em disco', () => {
    const store = SettingsStore.load(dir);
    store.update({ theme: 'dark' });
    store.update({ terminalFontSize: 18 });
    expect(store.get()).toMatchObject({ theme: 'dark', terminalFontSize: 18 });
    const onDisk = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')) as unknown;
    expect(onDisk).toMatchObject({ theme: 'dark', terminalFontSize: 18 });
    expect(SettingsStore.load(dir).get()).toMatchObject({ theme: 'dark', terminalFontSize: 18 });
  });

  it('salva tamanho e posição da janela', () => {
    const store = SettingsStore.load(dir);
    store.saveWindow({ width: 900, height: 600, x: 10, y: 20, maximized: false });
    expect(SettingsStore.load(dir).get().window).toEqual({
      width: 900,
      height: 600,
      x: 10,
      y: 20,
      maximized: false,
    });
  });
});

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoLock } from '../../../src/main/vault/autolock';
import { vaultSettingsSchema } from '../../../src/main/vault/content';
import { TEST_KDF } from '../../../src/main/vault/crypto';
import { VaultStore } from '../../../src/main/vault/store';

const MIN = 60_000;

describe('AutoLock', () => {
  let vault: VaultStore;
  let auto: AutoLock;

  beforeEach(async () => {
    vault = await VaultStore.open(mkdtempSync(join(tmpdir(), 'sv-auto-')), { kdf: TEST_KDF });
    await vault.create('senha-teste-1', 'senha-teste-1');
    vi.useFakeTimers();
    auto = new AutoLock(vault);
  });

  afterEach(() => {
    auto.dispose();
    vi.useRealTimers();
  });

  it('bloqueia após 15 minutos sem atividade (padrão)', () => {
    expect(vault.read().settings.autoLockMinutes).toBe(15);
    vi.advanceTimersByTime(15 * MIN - 1000);
    expect(vault.state).toBe('unlocked');
    vi.advanceTimersByTime(2000);
    expect(vault.state).toBe('locked');
  });

  it('reportActivity reinicia o timer', () => {
    vi.advanceTimersByTime(10 * MIN);
    auto.reportActivity();
    vi.advanceTimersByTime(10 * MIN);
    expect(vault.state).toBe('unlocked');
    vi.advanceTimersByTime(6 * MIN);
    expect(vault.state).toBe('locked');
  });

  it('null desativa o bloqueio automático', async () => {
    await vault.mutate((c) => {
      c.settings.autoLockMinutes = null;
    });
    auto.reconfigure();
    vi.advanceTimersByTime(500 * MIN);
    expect(vault.state).toBe('unlocked');
  });

  it('usa o valor configurado', async () => {
    await vault.mutate((c) => {
      c.settings.autoLockMinutes = 1;
    });
    auto.reconfigure();
    vi.advanceTimersByTime(MIN + 1000);
    expect(vault.state).toBe('locked');
  });

  it('reinicia o timer ao desbloquear de novo', async () => {
    vault.lock();
    vi.useRealTimers();
    await vault.unlock('senha-teste-1');
    vi.useFakeTimers();
    auto.reconfigure();
    vi.advanceTimersByTime(14 * MIN);
    expect(vault.state).toBe('unlocked');
  });

  it.each([0, 121, 1.5, -1])('rejeita autoLockMinutes %s', (value) => {
    expect(
      vaultSettingsSchema.safeParse({ autoLockMinutes: value, connectTimeoutSeconds: 15 }).success,
    ).toBe(false);
  });

  it('aceita 1, 120 e null', () => {
    for (const value of [1, 120, null]) {
      expect(
        vaultSettingsSchema.safeParse({ autoLockMinutes: value, connectTimeoutSeconds: 15 })
          .success,
      ).toBe(true);
    }
  });
});

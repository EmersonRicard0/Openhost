// Bloqueio por inatividade no processo principal (FR-003). Não encerra sessões.
import type { VaultStore } from './store';

export class AutoLock {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly vault: VaultStore) {
    this.unsubscribe = vault.onStateChanged((s) => {
      if (s.state === 'unlocked') this.reconfigure();
      else this.clear();
    });
    if (vault.state === 'unlocked') this.reconfigure();
  }

  /** Reinicia com o valor atual de `autoLockMinutes` (chamar após mudar a configuração). */
  reconfigure(): void {
    this.clear();
    if (this.vault.state !== 'unlocked') return;
    const minutes = this.vault.read().settings.autoLockMinutes;
    if (minutes === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.vault.lock();
    }, minutes * 60_000);
  }

  reportActivity(): void {
    if (this.timer) this.reconfigure();
  }

  dispose(): void {
    this.clear();
    this.unsubscribe();
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

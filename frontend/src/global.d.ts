import type { ShellVaultApi } from '@shared/ipc/api';

declare global {
  /** Versão do package.json, injetada pelo Vite. */
  const __APP_VERSION__: string;

  interface ImportMetaEnv {
    /** Build de teste de abertura (`-tags smoke`, specs/004-linux-macos R11). */
    readonly VITE_SMOKE?: string;
  }

  interface Window {
    readonly shellvault: ShellVaultApi;
  }
}

export {};

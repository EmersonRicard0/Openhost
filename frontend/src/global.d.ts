import type { ShellVaultApi } from '@shared/ipc/api';

declare global {
  /** Versão do package.json, injetada pelo Vite. */
  const __APP_VERSION__: string;

  interface Window {
    readonly shellvault: ShellVaultApi;
  }
}

export {};

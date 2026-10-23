import type { ShellVaultApi } from '@shared/ipc/api';

declare global {
  interface Window {
    readonly shellvault: ShellVaultApi;
  }
}

export {};

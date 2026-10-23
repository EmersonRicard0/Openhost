import type { BrowserWindow } from 'electron';
import type { CloseGuard } from './closeGuard';
import type { ForwardingManager } from './forwarding/manager';
import type { Emitter, Registrar } from './ipc/register';
import type { SessionRegistry } from './sessions/registry';
import type { TransferManager } from './sftp/transfers';
import type { Interactions } from './ssh/interactions';
import type { SettingsStore } from './settings';
import type { AutoLock } from './vault/autolock';
import type { VaultStore } from './vault/store';

/** Dependências compartilhadas pelos módulos do processo principal. */
export interface MainContext {
  reg: Registrar;
  events: Emitter;
  dataDir: string;
  getWindow(): BrowserWindow | null;
  settings: SettingsStore;
  sessions: SessionRegistry;
  interactions: Interactions;
  transfers: TransferManager;
  forwards: ForwardingManager;
  vault: VaultStore;
  autoLock: AutoLock;
  closeGuard: CloseGuard;
}

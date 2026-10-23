import type { MainContext } from '../context';
import { registerAppHandlers } from './app';
import { registerCredentialHandlers } from './credentials';
import { registerForwardHandlers } from './forwards';
import { registerGroupHandlers } from './groups';
import { registerHostHandlers } from './hosts';
import { registerSessionHandlers } from './sessions';
import { registerSftpHandlers } from './sftp';
import { registerVaultHandlers } from './vault';

/** Registra todos os módulos da ponte; cada módulo novo acrescenta sua chamada aqui. */
export function registerIpcModules(ctx: MainContext): void {
  registerAppHandlers(ctx);
  registerVaultHandlers(ctx);
  registerHostHandlers(ctx);
  registerGroupHandlers(ctx);
  registerCredentialHandlers(ctx);
  registerSessionHandlers(ctx);
  registerSftpHandlers(ctx);
  registerForwardHandlers(ctx);
}

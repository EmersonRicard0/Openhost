import { z } from 'zod';
import type { MainContext } from '../context';
import { vaultSettingsSchema } from '../vault/content';
import { fail } from './messages';
import { definedOnly } from './schemas';

const password = z.string().max(4096);
export const ERASE_PHRASE = 'APAGAR';

export function registerVaultHandlers(ctx: MainContext): void {
  const { reg, vault, autoLock, events } = ctx;

  vault.onStateChanged((status) => {
    events.emit('vault', 'onStateChanged', status);
  });

  reg.handle('vault', 'getStatus', z.tuple([]), () => vault.status);

  reg.handle('vault', 'create', z.tuple([password, password]), (pw, confirmation) =>
    vault.create(pw, confirmation),
  );

  reg.handle('vault', 'unlock', z.tuple([password]), (pw) => vault.unlock(pw));

  reg.handle('vault', 'lock', z.tuple([]), () => {
    vault.lock();
  });

  reg.handle(
    'vault',
    'changePassword',
    z.tuple([password, password, password]),
    (current, next, confirmation) => vault.changePassword(current, next, confirmation),
    { requiresUnlocked: true },
  );

  reg.handle('vault', 'erase', z.tuple([z.string()]), async (phrase) => {
    // Segunda confirmação; a primeira é o diálogo na interface (FR-006).
    if (phrase !== ERASE_PHRASE) throw fail('INVALID_INPUT');
    await vault.erase();
  });

  reg.handle('vault', 'getSettings', z.tuple([]), () => vault.read().settings, {
    requiresUnlocked: true,
  });

  reg.handle(
    'vault',
    'updateSettings',
    z.tuple([vaultSettingsSchema.partial().strict()]),
    async (patch) => {
      const settings = await vault.mutate((c) => {
        c.settings = { ...c.settings, ...definedOnly(patch) };
        return c.settings;
      });
      autoLock.reconfigure();
      return settings;
    },
    { requiresUnlocked: true },
  );

  reg.handle('vault', 'reportActivity', z.tuple([]), () => {
    autoLock.reportActivity();
  });
}

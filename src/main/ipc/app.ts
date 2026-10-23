import { z } from 'zod';
import { currentAppearance } from '../appearance';
import type { MainContext } from '../context';
import { uiSettingsPatchSchema } from '../settings';
import { definedOnly } from './schemas';

export function registerAppHandlers(ctx: MainContext): void {
  const { reg } = ctx;
  reg.handle('app', 'getAppearance', z.tuple([]), () => currentAppearance());
  reg.handle('app', 'getUiSettings', z.tuple([]), () => ctx.settings.get());
  reg.handle('app', 'updateUiSettings', z.tuple([uiSettingsPatchSchema]), (patch) =>
    ctx.settings.update(definedOnly(patch)),
  );
  reg.handle('app', 'confirmClose', z.tuple([z.boolean()]), (confirmed) => {
    ctx.closeGuard.confirm(confirmed);
  });
}

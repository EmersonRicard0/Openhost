import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
}

/** Abre o app compilado (`out/`) com um diretório de dados isolado. */
export async function launchApp(
  options: { dataDir?: string; env?: Record<string, string> } = {},
): Promise<LaunchedApp> {
  const dataDir = options.dataDir ?? mkdtempSync(join(tmpdir(), 'shellvault-e2e-'));
  const app = await electron.launch({
    args: [resolve(import.meta.dirname, '../../../out/main/index.js')],
    env: {
      ...process.env,
      SHELLVAULT_E2E: '1',
      SHELLVAULT_DATA_DIR: dataDir,
      ...options.env,
    },
  });
  // A confirmação ao fechar (FR-028) seguraria o `close()` dos testes com sessões abertas;
  // `destroy()` encerra a janela sem passar pelo evento `close`.
  const close = app.close.bind(app);
  app.close = async () => {
    await app
      .evaluate(({ BrowserWindow }) => {
        for (const w of BrowserWindow.getAllWindows()) w.destroy();
      })
      .catch(() => undefined);
    await close();
  };
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, dataDir };
}

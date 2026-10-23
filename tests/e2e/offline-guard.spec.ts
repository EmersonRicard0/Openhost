// App offline: nenhuma requisição de rede sai pelo Chromium (T102, FR-027).
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { createVault, openLocalTab, waitPowerShellPrompt } from './helpers/ui';

const LOCAL = /^(file|data|devtools|blob):/;

test('requisições externas são canceladas e o fluxo básico não usa a rede', async () => {
  const { app, page } = await launchApp();
  const external: string[] = [];
  page.on('request', (req) => {
    if (!LOCAL.test(req.url())) external.push(req.url());
  });
  try {
    await createVault(page);
    const id = await openLocalTab(page, 'PowerShell');
    await waitPowerShellPrompt(page, id);

    // Pelo renderer: barrado (CSP e webRequest).
    const fromRenderer = await page.evaluate(async () => {
      try {
        await fetch('https://example.com');
        return 'ok';
      } catch (e) {
        return String(e);
      }
    });
    expect(fromRenderer).not.toBe('ok');

    // Pela sessão, sem CSP no caminho: o cancelamento é do webRequest.
    const fromSession = await app.evaluate(async ({ session }) => {
      try {
        await session.defaultSession.fetch('https://example.com');
        return 'ok';
      } catch (e) {
        return String(e);
      }
    });
    expect(fromSession).toContain('ERR_BLOCKED_BY_CLIENT');

    // Só a tentativa explícita acima pode aparecer; nada do fluxo em si.
    expect(external.filter((url) => !url.startsWith('https://example.com'))).toEqual([]);
  } finally {
    await app.close();
  }
});

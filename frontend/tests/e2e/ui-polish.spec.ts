// Acabamento da interface (US5, T114): barra lateral recolhível, configurações como página e
// barra de status.
import { expect, test, type Page } from '@playwright/test';
import { launchApp, testService } from './helpers/launch';
import {
  createVault,
  openLocalTab,
  resizeCount,
  sidebarHosts,
  terminalSize,
  unlock,
  waitPowerShellPrompt,
} from './helpers/ui';

interface Size {
  cols: number;
  rows: number;
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Barra lateral recolhida' });

async function expectServerMatches(page: Page, sessionId: string): Promise<void> {
  await expect
    .poll(async () => {
      const [xterm, server] = await Promise.all([
        terminalSize(page, sessionId),
        testService<Size | null>(page, 'ServerSizeOf', sessionId),
      ]);
      return JSON.stringify(server) === JSON.stringify(xterm);
    })
    .toBe(true);
}

test('Ctrl+B recolhe e expande a lateral sem reconectar e o estado volta após reiniciar (FR-167)', async () => {
  let app = await launchApp();
  const { dataDir } = app;
  try {
    const { page } = app;
    await createVault(page);
    const id = await openLocalTab(page, 'PowerShell');
    await waitPowerShellPrompt(page, id);
    const before = await terminalSize(page, id);
    if (!before) throw new Error('terminal sem tamanho');

    await page.keyboard.press('Control+B');
    await expect(rail(page)).toBeVisible();
    await expect(sidebarHosts(page)).toBeHidden();
    await expect
      .poll(async () => (await terminalSize(page, id))?.cols)
      .toBeGreaterThan(before.cols);
    await expectServerMatches(page, id);
    // A mesma sessão continua: o painel ainda é o da aba aberta antes.
    await expect(page.locator(`[data-session-id="${id}"]`)).toBeVisible();

    // Rótulo do ícone aparece ao passar o mouse.
    await rail(page).getByRole('button', { name: 'Encaminhamentos ativos' }).hover();
    await expect(page.getByRole('tooltip')).toHaveText('Encaminhamentos ativos');

    await page.keyboard.press('Control+B');
    await expect(sidebarHosts(page)).toBeVisible();
    await expect(rail(page)).toBeHidden();
    await expect.poll(async () => (await terminalSize(page, id))?.cols).toBe(before.cols);
    await expectServerMatches(page, id);
    // Uma ida e volta não deve gerar uma enxurrada de resize no servidor.
    expect(await resizeCount(page, id)).toBeLessThanOrEqual(6);

    // Recolhida, a escolha persiste entre execuções.
    await page.getByRole('button', { name: 'Recolher barra lateral (Ctrl+B)' }).click();
    await expect(rail(page)).toBeVisible();
    await app.close();

    app = await launchApp({ dataDir });
    await expect(rail(app.page)).toBeVisible({ timeout: 30_000 });
    await rail(app.page).getByRole('button', { name: 'Desbloquear o cofre' }).click();
    await unlock(app.page);
    await expect(sidebarHosts(app.page)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('configurações abrem como página, Esc volta à aba e a barra de status mostra a aba ativa (FR-168, FR-172)', async () => {
  const app = await launchApp();
  try {
    const { page } = app;
    await createVault(page);
    const id = await openLocalTab(page, 'PowerShell');
    await waitPowerShellPrompt(page, id);

    const status = page.getByRole('contentinfo', { name: 'Barra de status' });
    await expect(status.getByTestId('status-tab')).toContainText('PowerShell');
    await expect(status.getByTestId('status-state')).toHaveText('Em execução');

    await page.keyboard.press('Control+K');
    await page.keyboard.type('configura');
    await page.keyboard.press('Enter');
    const settings = page.getByRole('region', { name: 'Configurações' });
    await expect(settings).toBeVisible();
    // A aba segue aberta por baixo, sem reconectar.
    await expect(page.getByRole('tab', { name: 'PowerShell' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(page.locator(`[data-session-id="${id}"]`)).toBeVisible();

    // Clicar numa aba também volta ao terminal.
    await page.getByRole('button', { name: 'Configurações' }).click();
    await expect(settings).toBeVisible();
    await page.getByRole('tab', { name: 'PowerShell' }).click();
    await expect(settings).toBeHidden();
  } finally {
    await app.close();
  }
});

// Atualização pelo próprio app (specs/007, quickstart §2): aviso, lembrar/pular, download até
// "pronto", assinatura recusada, confirmação com sessões, instalação manual e verificação
// automática desligada. O app fala só com o servidor de releases local do teste.
import { expect, test, type Page } from '@playwright/test';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { startReleaseServer, type ReleaseServer } from './helpers/releases';
import { createVault, openLocalTab, unlock } from './helpers/ui';

let releases: ReleaseServer;

test.beforeAll(async () => {
  releases = await startReleaseServer();
});

test.afterAll(async () => {
  await releases.close();
});

const toast = (page: Page) => page.locator('[data-update-state]');

async function openAbout(page: Page) {
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  const settings = page.getByRole('region', { name: 'Configurações' });
  await settings.getByRole('button', { name: 'Sobre', exact: true }).click();
  return settings;
}

async function withApp(
  options: Parameters<typeof launchApp>[0],
  body: (app: LaunchedApp) => Promise<void>,
): Promise<string> {
  const app = await launchApp(options);
  try {
    await body(app);
  } finally {
    await app.close();
  }
  return app.dataDir;
}

test('aviso aparece sozinho; lembrar depois some; pular não volta, versão maior volta (cenários 1 e 2)', async () => {
  releases.publish('0.6.0');
  const dataDir = await withApp({ env: releases.env() }, async ({ page }) => {
    await createVault(page);
    await expect(toast(page)).toHaveAttribute('data-update-state', 'available', {
      timeout: 10_000,
    });
    await expect(toast(page)).toContainText('Versão 0.6.0 disponível');
    // O aviso não rouba o foco (FR-707).
    expect(await toast(page).evaluate((el) => el.contains(document.activeElement))).toBe(false);
    await toast(page).getByRole('button', { name: 'Ver novidades' }).click();
    await expect(toast(page)).toContainText('Novidades');
    await toast(page).getByRole('button', { name: 'Lembrar depois' }).click();
    await expect(toast(page)).toHaveCount(0);
    // O indicador da barra de status reabre o aviso (FR-708).
    await page.getByRole('button', { name: 'Atualização disponível' }).click();
    await expect(toast(page)).toBeVisible();
    await toast(page).getByRole('button', { name: 'Pular esta versão' }).click();
    await expect(toast(page)).toHaveCount(0);
  });

  await withApp({ dataDir, env: releases.env() }, async ({ page }) => {
    await unlock(page);
    await expect.poll(() => releases.listRequests(), { timeout: 10_000 }).toBeGreaterThan(1);
    await page.waitForTimeout(1_000);
    await expect(toast(page)).toHaveCount(0);
  });

  releases.publish('0.7.0');
  await withApp({ dataDir, env: releases.env() }, async ({ page }) => {
    await unlock(page);
    await expect(toast(page)).toContainText('Versão 0.7.0 disponível', { timeout: 10_000 });
  });
});

test('atualizar baixa até "pronto" e reiniciar pergunta contando as sessões (cenários 3 e 5)', async () => {
  releases.publish('0.6.0');
  await withApp({ env: releases.env() }, async ({ page }) => {
    await createVault(page);
    await openLocalTab(page, 'PowerShell');
    await expect(toast(page)).toHaveAttribute('data-update-state', 'available', {
      timeout: 10_000,
    });
    await toast(page).getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(toast(page)).toHaveAttribute('data-update-state', 'downloading');
    await expect(toast(page).getByRole('progressbar')).toBeVisible();
    await expect(toast(page)).toHaveAttribute('data-update-state', 'ready', { timeout: 30_000 });
    await expect(toast(page)).toContainText('Versão 0.6.0 pronta para instalar');

    await toast(page).getByRole('button', { name: 'Reiniciar para atualizar' }).click();
    const confirm = page.getByRole('dialog', { name: 'Reiniciar para atualizar?' });
    await expect(confirm).toContainText('1 sessão aberta será encerrada');
    await expect(confirm.getByRole('button', { name: 'Atualizar ao fechar' })).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Reiniciar agora' })).toBeVisible();
    // Sem reiniciar de fato: cancelar mantém o app e o aviso pronto.
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    await expect(toast(page)).toHaveAttribute('data-update-state', 'ready');
  });
});

test('pacote com assinatura inválida é recusado (cenário 4)', async () => {
  releases.publish('0.6.0', { badSignature: true });
  await withApp({ env: releases.env() }, async ({ page }) => {
    await createVault(page);
    await expect(toast(page)).toHaveAttribute('data-update-state', 'available', {
      timeout: 10_000,
    });
    await toast(page).getByRole('button', { name: 'Atualizar', exact: true }).click();
    await expect(toast(page)).toHaveAttribute('data-update-state', 'failed', { timeout: 30_000 });
    await expect(toast(page).getByRole('alert')).toHaveText(
      'Não foi possível confirmar a origem da atualização.',
    );
    await expect(toast(page).getByRole('button', { name: 'Reiniciar para atualizar' })).toHaveCount(
      0,
    );
  });
});

test('instalação .deb mostra o comando e não oferece reiniciar (T018)', async () => {
  releases.publish('0.6.0');
  await withApp({ env: releases.env('deb') }, async ({ page }) => {
    await createVault(page);
    await expect(toast(page)).toHaveAttribute('data-update-state', 'available', {
      timeout: 10_000,
    });
    await toast(page).getByRole('button', { name: 'Baixar pacote' }).click();
    await expect(toast(page)).toHaveAttribute('data-update-state', 'ready', { timeout: 30_000 });
    await expect(toast(page)).toContainText('Pacote da versão 0.6.0 baixado');
    await expect(toast(page).locator('code')).toHaveText(
      'sudo apt install ./openhost_0.6.0_amd64.deb',
    );
    await expect(toast(page).getByRole('button', { name: 'Copiar comando' })).toBeVisible();
    await expect(toast(page).getByRole('button', { name: 'Abrir pasta' })).toBeVisible();
    await expect(toast(page).getByRole('button', { name: 'Reiniciar para atualizar' })).toHaveCount(
      0,
    );
  });
});

test('Configurações e paleta procuram atualização; automático desligado não faz requisição (cenários 6 e 7)', async () => {
  releases.publish(null);
  const dataDir = await withApp({ env: releases.env() }, async ({ page }) => {
    await createVault(page);
    const settings = await openAbout(page);
    await expect(settings).toContainText('Versão instalada: 0.0.0');
    await settings.getByRole('button', { name: 'Procurar atualizações' }).click();
    await expect(settings.getByRole('status')).toHaveText(
      'Você já está na versão mais recente (0.0.0).',
    );
    await expect(settings).toContainText('Última verificação:');
    await settings.getByLabel('Verificar automaticamente').uncheck();

    releases.publish('0.6.0');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Shift+P');
    const palette = page.getByRole('dialog', { name: 'Paleta de comandos' });
    await palette.getByRole('combobox').fill('Procurar atualizações');
    await page.keyboard.press('Enter');
    await expect(toast(page)).toContainText('Versão 0.6.0 disponível', { timeout: 10_000 });
  });

  releases.resetCount();
  await withApp({ dataDir, env: releases.env() }, async ({ page }) => {
    await unlock(page);
    await page.waitForTimeout(3_000);
    expect(releases.listRequests()).toBe(0);
    await expect(toast(page)).toHaveCount(0);
  });
});

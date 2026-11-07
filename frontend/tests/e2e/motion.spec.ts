// Animações (specs/015): abertura com a marca, sem atrasar o primeiro campo.
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { addHost, createVault, hostItem, unlockForm } from './helpers/ui';

test.describe('015 animações', () => {
  test('abertura: marca até a primeira tela, que já chega com foco (US1)', async () => {
    let app = await launchApp({ motion: true });
    const { dataDir } = app;
    try {
      // A primeira tela (criar cofre) aparece e a abertura sai do DOM.
      await expect(app.page.getByLabel('Senha mestra', { exact: true })).toBeVisible();
      await expect(app.page.locator('#boot')).toHaveCount(0, { timeout: 2_000 });
      await createVault(app.page);
    } finally {
      await app.close();
    }

    app = await launchApp({ dataDir, motion: true });
    try {
      const field = unlockForm(app.page).getByLabel('Senha mestra', { exact: true });
      await expect(field).toBeFocused();
      // Digitar já funciona, com a abertura saindo ou não (FR-1501).
      await app.page.keyboard.type('abc');
      await expect(field).toHaveValue('abc');
      await expect(app.page.locator('#boot')).toHaveCount(0, { timeout: 2_000 });
      await expect(app.page.locator('html')).toHaveAttribute('data-motion', /^(full|reduced)$/);
    } finally {
      await app.close();
    }
  });
});

test('duplo Enter num host abre uma sessão só (US2, FR-1509)', async () => {
  const app = await launchApp();
  try {
    await createVault(app.page);
    await addHost(app.page, { label: 'duplo', address: '127.0.0.1', port: 1, username: 'x', method: 'Perguntar ao conectar' });
    const item = hostItem(app.page, 'duplo');
    await item.focus();
    await app.page.keyboard.press('Enter');
    await app.page.keyboard.press('Enter');
    await expect(app.page.getByRole('tab', { name: 'duplo' })).toHaveCount(1);
  } finally {
    await app.close();
  }
});

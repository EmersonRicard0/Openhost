// Animações (specs/015): abertura com a marca, sem atrasar o primeiro campo.
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { createVault, unlockForm } from './helpers/ui';

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

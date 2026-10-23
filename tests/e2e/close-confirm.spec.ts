// Confirmação ao fechar com sessão aberta (T101, FR-028).
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { createVault, openLocalTab, waitPowerShellPrompt } from './helpers/ui';

test('fechar com sessão local aberta pede confirmação; cancelar mantém, confirmar fecha', async () => {
  const { app, page } = await launchApp();
  const state = { closed: false };
  app.on('close', () => {
    state.closed = true;
  });
  try {
    await createVault(page);
    const id = await openLocalTab(page, 'PowerShell');
    await waitPowerShellPrompt(page, id);

    const requestClose = () =>
      app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close();
      });

    await requestClose();
    const dialog = page.getByRole('dialog', { name: 'Fechar o ShellVault?' });
    await expect(dialog).toContainText('1 sessão aberta');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

    await requestClose();
    await dialog.getByRole('button', { name: 'Fechar mesmo assim' }).click();
    await expect.poll(() => state.closed, { timeout: 10_000 }).toBe(true);
  } finally {
    if (!state.closed) await app.close();
  }
});

test('sem nada em andamento fecha direto', async () => {
  const { app, page } = await launchApp();
  const done = new Promise<void>((resolve) => app.on('close', resolve));
  await createVault(page);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.close();
  });
  await done;
});

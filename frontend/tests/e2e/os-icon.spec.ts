// Logo do sistema no avatar do host (FR-178, T128): detectado na conexão, trocado no formulário
// e lembrado após reiniciar.
import { expect, test, type Page } from '@playwright/test';
import { SSHD, up } from '../../../scripts/sshd.mjs';
import { launchApp } from './helpers/launch';
import {
  acceptHostKey,
  addHost,
  chooseOption,
  createVault,
  hostItem,
  unlock,
  waitConnected,
} from './helpers/ui';

const avatar = (page: Page, label: string) => hostItem(page, label).locator('[data-os]');

async function chooseIcon(page: Page, label: string, icon: string): Promise<void> {
  await hostItem(page, label).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar host' });
  await chooseOption(dialog, 'Ícone', icon);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

test.beforeAll(async () => {
  await up();
});

// Liga quando o Go gravar detectedOs/osIcon (T126) e OS_ICON_EDITABLE virar true.
test.fixme('avatar mostra o sistema detectado; a escolha manual persiste e Automático volta (FR-178)', async () => {
  let app = await launchApp();
  const { dataDir } = app;
  try {
    await createVault(app.page);
    await addHost(app.page, {
      label: 'pw-host',
      address: SSHD.host,
      port: SSHD.port,
      username: 'pwuser',
      password: 'pw-test-123',
    });
    // Antes da primeira conexão o avatar fica com as iniciais.
    await expect(avatar(app.page, 'pw-host')).toHaveCount(0);
    await hostItem(app.page, 'pw-host').dblclick();
    await acceptHostKey(app.page);
    await waitConnected(app.page, 'pw-host');
    // O servidor de teste é Alpine (tests/fixtures/sshd/Dockerfile).
    await expect(avatar(app.page, 'pw-host')).toHaveAttribute('data-os', 'alpine', {
      timeout: 10_000,
    });

    await chooseIcon(app.page, 'pw-host', 'Cisco');
    await expect(avatar(app.page, 'pw-host')).toHaveAttribute('data-os', 'cisco');
    await app.close();

    app = await launchApp({ dataDir });
    await unlock(app.page);
    await expect(avatar(app.page, 'pw-host')).toHaveAttribute('data-os', 'cisco');
    await chooseIcon(app.page, 'pw-host', 'Automático (Alpine Linux)');
    await expect(avatar(app.page, 'pw-host')).toHaveAttribute('data-os', 'alpine');
  } finally {
    await app.close();
  }
});

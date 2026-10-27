// Sincronização pelo Google Drive (specs/008, quickstart §2, cenários 1–3): conectar, mudança
// subindo sozinha e mudança guardada sem rede. O app fala só com o Drive falso local.
import { expect, test, type Page } from '@playwright/test';
import { startFakeDrive, type FakeDrive } from './helpers/drive';
import { launchApp } from './helpers/launch';
import { addHost, createVault, hostItem } from './helpers/ui';

let drive: FakeDrive;

test.beforeEach(async () => {
  drive = await startFakeDrive();
});

test.afterEach(async () => {
  await drive.close();
});

const HOST = {
  label: 'sync-rotulo-host',
  address: '10.77.66.55',
  port: 22,
  username: 'sync-usuario',
  password: 'sync-senha-secreta-9',
};

async function openSync(page: Page) {
  await page.getByRole('button', { name: 'Configurações' }).first().click();
  const settings = page.getByRole('region', { name: 'Configurações' });
  await settings.getByRole('button', { name: 'Sincronização', exact: true }).click();
  return settings;
}

const syncState = (page: Page) =>
  page.getByRole('region', { name: 'Configurações' }).locator('p[data-sync-state]');

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Configurações' })).toBeHidden();
}

async function editAddress(page: Page, label: string, address: string): Promise<void> {
  await hostItem(page, label).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar host' });
  await dialog.getByLabel('Endereço', { exact: true }).fill(address);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

test('conectar envia o cofre cifrado e cada mudança sobe sozinha (cenários 1 e 2)', async () => {
  const app = await launchApp({ env: drive.env });
  try {
    await createVault(app.page);
    await addHost(app.page, HOST);

    const settings = await openSync(app.page);
    await settings.getByTestId('sync-connect').click();
    await expect(syncState(app.page)).toHaveAttribute('data-sync-state', 'synced', {
      timeout: 20_000,
    });
    await expect(settings).toContainText('Conta: usuario@example.com');
    await expect(settings).toContainText('Última sincronização:');

    const files = await drive.files();
    expect(files.map((f) => f.name)).toContain('keyring.json');
    const snapshots = files.filter((f) => f.name.startsWith('snap-'));
    expect(snapshots).toHaveLength(1);
    // Nada legível do host na nuvem (SC-804).
    for (const file of files) {
      for (const secret of [HOST.label, HOST.address, HOST.username, HOST.password]) {
        expect(file.data.includes(Buffer.from(secret)), `${file.name} contém ${secret}`).toBe(
          false,
        );
      }
    }

    await closeSettings(app.page);
    await addHost(app.page, { ...HOST, label: 'sync-segundo-host', address: '10.77.66.56' });
    await expect.poll(async () => (await drive.snapshots()).length, { timeout: 10_000 }).toBe(2);
  } finally {
    await app.close();
  }
});

test('sem rede a mudança fica pendente e sobe quando a conexão volta (cenário 3)', async () => {
  const app = await launchApp({ env: drive.env });
  try {
    await createVault(app.page);
    await addHost(app.page, HOST);
    await openSync(app.page);
    await app.page.getByTestId('sync-connect').click();
    await expect(syncState(app.page)).toHaveAttribute('data-sync-state', 'synced', {
      timeout: 20_000,
    });
    await closeSettings(app.page);

    await drive.setOffline(true);
    await editAddress(app.page, HOST.label, '10.77.66.99');
    // O indicador da barra de status abre a seção e mostra o pendente.
    await expect(app.page.getByRole('button', { name: /Pendente/ })).toBeVisible({
      timeout: 15_000,
    });
    await app.page.getByRole('button', { name: /Pendente/ }).click();
    await expect(syncState(app.page)).toHaveAttribute('data-sync-state', 'pending');
    await expect(syncState(app.page)).toContainText('pendente de sincronizar');
    expect(await drive.snapshots()).toHaveLength(1);

    await drive.setOffline(false);
    await expect(syncState(app.page)).toHaveAttribute('data-sync-state', 'synced', {
      timeout: 30_000,
    });
    expect(await drive.snapshots()).toHaveLength(2);
  } finally {
    await app.close();
  }
});

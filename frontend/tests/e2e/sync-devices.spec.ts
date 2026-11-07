// Sincronização entre dois computadores (specs/008, quickstart §2, cenários 4–10): cada app tem
// a própria pasta de dados e os dois falam com o mesmo Drive falso local.
import { expect, test, type Page } from '@playwright/test';
import { startFakeDrive, type FakeDrive } from './helpers/drive';
import { launchApp, type LaunchedApp } from './helpers/launch';
import { MASTER_PASSWORD, addHost, createVault, hostItem, sidebarHosts } from './helpers/ui';

let drive: FakeDrive;
const apps: LaunchedApp[] = [];

test.beforeEach(async () => {
  drive = await startFakeDrive();
});

test.afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  await drive.close();
});

async function launch(): Promise<Page> {
  const app = await launchApp({ env: drive.env });
  apps.push(app);
  return app.page;
}

const host = (label: string, address: string) => ({
  label,
  address,
  port: 22,
  username: 'sync-usuario',
  password: 'sync-senha-secreta-9',
});

const settingsRegion = (page: Page) => page.getByRole('region', { name: 'Configurações' });
const syncState = (page: Page) => settingsRegion(page).locator('p[data-sync-state]');

async function openSettings(page: Page, section: string) {
  if (!(await settingsRegion(page).isVisible())) {
    await page.getByRole('button', { name: 'Configurações' }).first().click();
  }
  await settingsRegion(page).getByRole('button', { name: section, exact: true }).click();
  return settingsRegion(page);
}

async function closeSettings(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(settingsRegion(page)).toBeHidden();
}

async function expectState(page: Page, state: string, timeout = 20_000): Promise<void> {
  await expect(syncState(page)).toHaveAttribute('data-sync-state', state, { timeout });
}

/** Primeiro computador: cofre novo, hosts e conexão. */
async function firstDevice(page: Page, hosts: ReturnType<typeof host>[]): Promise<void> {
  await createVault(page);
  for (const h of hosts) await addHost(page, h);
  const settings = await openSettings(page, 'Sincronização');
  await settings.getByTestId('sync-connect').click();
  await expectState(page, 'synced');
  await closeSettings(page);
}

/** Computador novo pela primeira tela: "Usar meu cofre do Google Drive". */
async function openFromCloud(page: Page, password = MASTER_PASSWORD): Promise<void> {
  await page.getByRole('button', { name: 'Usar meu cofre do Google Drive' }).click();
  await page.getByTestId('sync-open-connect').click();
  await page.getByLabel('Senha mestra do cofre', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
}

/** Força a troca com a nuvem e espera o estado final. */
async function syncNow(page: Page, state = 'synced'): Promise<void> {
  const settings = await openSettings(page, 'Sincronização');
  await expect(settings.getByRole('button', { name: 'Sincronizar agora' })).toBeEnabled({
    timeout: 20_000,
  });
  await settings.getByRole('button', { name: 'Sincronizar agora' }).click();
  await expectState(page, state);
}

async function editAddress(page: Page, label: string, address: string): Promise<void> {
  await hostItem(page, label).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar host' });
  await dialog.getByLabel('Endereço', { exact: true }).fill(address);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

async function expectAddress(page: Page, label: string, address: string): Promise<void> {
  await expect(hostItem(page, label)).toContainText(address, { timeout: 20_000 });
}

test('computador novo abre o cofre da nuvem; senha errada não grava nada (cenário 4)', async () => {
  const a = await launch();
  await firstDevice(a, [host('nuvem-host-a', '10.40.0.1')]);

  const b = await launch();
  await openFromCloud(b, 'senha-errada-123');
  await expect(b.getByText('Senha incorreta', { exact: false })).toBeVisible();
  await expect(sidebarHosts(b)).toBeHidden();

  await b.getByLabel('Senha mestra do cofre', { exact: true }).fill(MASTER_PASSWORD);
  await b.getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(sidebarHosts(b)).toBeVisible({ timeout: 30_000 });
  await expect(hostItem(b, 'nuvem-host-a')).toBeVisible();
});

test('cofre próprio junta com o da nuvem sem duplicar o host igual (cenário 5)', async () => {
  const shared = host('host-igual', '10.50.0.1');
  const a = await launch();
  await firstDevice(a, [shared, host('so-no-a', '10.50.0.2')]);

  const b = await launch();
  await createVault(b, 'senha-do-b-123');
  await addHost(b, shared);
  await addHost(b, host('so-no-b', '10.50.0.3'));
  const settings = await openSettings(b, 'Sincronização');
  await settings.getByTestId('sync-connect').click();
  const dialog = b.getByRole('dialog', { name: 'Esta conta já tem um cofre' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('radio', { name: 'Juntar os dois' }).click();
  await dialog.getByLabel('Senha mestra do cofre da nuvem', { exact: true }).fill(MASTER_PASSWORD);
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expectState(b, 'synced');
  await closeSettings(b);

  for (const label of ['host-igual', 'so-no-a', 'so-no-b']) {
    await expect(hostItem(b, label)).toHaveCount(1);
  }
  await syncNow(a);
  await closeSettings(a);
  for (const label of ['host-igual', 'so-no-a', 'so-no-b']) {
    await expect(hostItem(a, label)).toHaveCount(1);
  }
});

test('mudanças em itens diferentes juntam sozinhas; no mesmo item viram conflito (cenário 6)', async () => {
  const a = await launch();
  await firstDevice(a, [host('host-x', '10.60.0.1'), host('host-y', '10.60.0.2')]);
  const b = await launch();
  await openFromCloud(b);
  await expect(hostItem(b, 'host-y')).toBeVisible({ timeout: 30_000 });

  // Itens diferentes: nenhuma pergunta.
  await editAddress(a, 'host-x', '10.60.1.1');
  await syncNow(a);
  await closeSettings(a);
  await editAddress(b, 'host-y', '10.60.2.2');
  await syncNow(b);
  await closeSettings(b);
  await syncNow(a);
  await closeSettings(a);
  await expectAddress(a, 'host-y', '10.60.2.2');
  await expectAddress(b, 'host-x', '10.60.1.1');

  // Mesmo item com o Drive fora do ar nos dois.
  await drive.setOffline(true);
  await editAddress(a, 'host-x', '10.60.9.1');
  await editAddress(b, 'host-x', '10.60.9.2');
  await drive.setOffline(false);
  await syncNow(a);
  await closeSettings(a);
  await syncNow(b, 'conflict');

  const settings = settingsRegion(b);
  await settings.getByRole('button', { name: 'Resolver 1 conflito' }).click();
  const dialog = b.getByRole('dialog', { name: 'Conflitos de sincronização' });
  await expect(dialog).toContainText('host-x');
  // Segredo nunca aparece no diálogo.
  await expect(dialog).not.toContainText('sync-senha-secreta-9');
  await dialog
    .getByRole('region', { name: 'No outro computador' })
    .getByRole('button', { name: 'Manter esta' })
    .click();
  await dialog.getByRole('button', { name: 'Fechar' }).click();
  await expectState(b, 'synced');
  await closeSettings(b);
  await expectAddress(b, 'host-x', '10.60.9.1');
  await syncNow(a);
  await closeSettings(a);
  await expectAddress(a, 'host-x', '10.60.9.1');
});

test('troca de senha em um computador pede a nova no outro e recusa a antiga (cenário 7)', async () => {
  const a = await launch();
  await firstDevice(a, [host('host-senha', '10.70.0.1')]);
  const b = await launch();
  await openFromCloud(b);
  await expect(hostItem(b, 'host-senha')).toBeVisible({ timeout: 30_000 });

  const nova = 'senha-nova-mestra-7';
  const vault = await openSettings(a, 'Cofre e segurança');
  await vault.getByRole('button', { name: 'Trocar senha mestra…' }).click();
  const change = a.getByRole('dialog', { name: 'Trocar senha mestra' });
  await change.getByLabel('Senha atual', { exact: true }).fill(MASTER_PASSWORD);
  await change.getByLabel('Nova senha mestra', { exact: true }).fill(nova);
  await change.getByLabel('Confirme a nova senha', { exact: true }).fill(nova);
  await change.getByRole('button', { name: 'Salvar' }).click();
  await expect(change).toBeHidden({ timeout: 30_000 });

  await syncNow(b, 'needsPassword');
  await settingsRegion(b).getByRole('button', { name: 'Continuar' }).click();
  const ask = b.getByRole('dialog', { name: 'Senha mestra trocada' });
  await ask.getByLabel('Nova senha mestra', { exact: true }).fill(MASTER_PASSWORD);
  await ask.getByRole('button', { name: 'Continuar' }).click();
  await expect(ask).toContainText('incorreta', { timeout: 20_000 });
  await ask.getByLabel('Nova senha mestra', { exact: true }).fill(nova);
  await ask.getByRole('button', { name: 'Continuar' }).click();
  await expect(ask).toBeHidden({ timeout: 30_000 });
  await expectState(b, 'synced');
});

test('restaurar uma versão anterior traz o host apagado de volta nos dois (cenário 8)', async () => {
  const a = await launch();
  await firstDevice(a, [host('host-volta', '10.80.0.1')]);
  const b = await launch();
  await openFromCloud(b);
  await expect(hostItem(b, 'host-volta')).toBeVisible({ timeout: 30_000 });

  await hostItem(a, 'host-volta').click({ button: 'right' });
  await a.getByRole('menuitem', { name: 'Excluir' }).click();
  const confirm = a.getByRole('dialog', { name: 'Excluir host' });
  await confirm.getByRole('button', { name: 'Excluir' }).click();
  await expect(hostItem(a, 'host-volta')).toHaveCount(0);
  await syncNow(a);

  await settingsRegion(a).getByRole('button', { name: 'Versões anteriores' }).click();
  const history = a.getByRole('dialog', { name: 'Versões anteriores' });
  const versions = history.locator('li[data-version]');
  await expect(versions).toHaveCount(2, { timeout: 20_000 });
  // A mais nova vem primeiro; a anterior ainda tem o host.
  await versions.nth(1).getByRole('button', { name: 'Restaurar' }).click();
  await a
    .getByRole('dialog', { name: 'Restaurar esta versão?' })
    .getByRole('button', { name: 'Restaurar' })
    .click();
  await expect(history).toBeHidden({ timeout: 20_000 });
  await closeSettings(a);
  await expect(hostItem(a, 'host-volta')).toBeVisible({ timeout: 20_000 });

  await syncNow(b);
  await closeSettings(b);
  await expect(hostItem(b, 'host-volta')).toBeVisible();
});

test('desconectar mantém o local; apagar do Drive avisa o outro computador (cenário 9)', async () => {
  const a = await launch();
  await firstDevice(a, [host('host-fica', '10.90.0.1')]);
  const b = await launch();
  await openFromCloud(b);
  await expect(hostItem(b, 'host-fica')).toBeVisible({ timeout: 30_000 });

  const settings = await openSettings(a, 'Sincronização');
  await settings.getByRole('button', { name: 'Desconectar' }).click();
  const dialog = a.getByRole('dialog', { name: 'Desconectar o Google Drive?' });
  await dialog.getByLabel('Apagar do Drive').check();
  await dialog.getByRole('button', { name: 'Desconectar' }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(settings.getByTestId('sync-connect')).toBeVisible();
  expect(await drive.files()).toHaveLength(0);
  await closeSettings(a);
  await expect(hostItem(a, 'host-fica')).toBeVisible();

  await syncNow(b, 'error');
  await expect(syncState(b)).toContainText('removido em outro computador');
  await closeSettings(b);
  await expect(hostItem(b, 'host-fica')).toBeVisible();
});

test('autorização revogada pede para conectar de novo (cenário 10)', async () => {
  const a = await launch();
  await firstDevice(a, [host('host-token', '10.100.0.1')]);

  await drive.failNext(401, 'authError');
  await syncNow(a, 'error');
  await expect(syncState(a)).toContainText('Conexão com o Google Drive perdida');
  await expect(settingsRegion(a).getByRole('button', { name: 'Conectar de novo' })).toBeVisible();
  await closeSettings(a);
  await expect(hostItem(a, 'host-token')).toBeVisible();
});

// Importar e exportar hosts (specs/003-host-import-export, T021 e T027): `~/.ssh/config` com prévia,
// duplicados e desfazer; `.openhost` com chaves levado para um cofre novo.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { KEYS_DIR } from '../../../scripts/gen-test-keys.mjs';
import { SSHD, up } from '../../../scripts/sshd.mjs';
import { launchApp, testService } from './helpers/launch';
import { acceptHostKey, createVault, hostItem, waitConnected } from './helpers/ui';

const FILE_PASSWORD = 'arquivo-teste-1';

function sshConfig(dir: string): string {
  const path = join(dir, 'config');
  const key = join(KEYS_DIR, 'ed25519').replaceAll('\\', '/');
  writeFileSync(
    path,
    [
      'Host pw-cfg',
      `  HostName ${SSHD.host}`,
      `  Port ${String(SSHD.port)}`,
      `  IdentityFile ${key}`,
      '',
      'Host sem-chave',
      `  HostName ${SSHD.host}`,
      `  Port ${String(SSHD.port)}`,
      '  IdentityFile C:/nao/existe/id_rsa',
      '  ProxyJump bastiao',
      '',
      'Host *.coringa',
      '  Port 2200',
      '',
      'Host *',
      '  User keyuser',
      '',
    ].join('\n'),
  );
  return path;
}

async function openImportExport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Importar e exportar' }).click();
  await expect(page.getByRole('heading', { name: 'Importar hosts' })).toBeVisible();
}

async function importFile(page: Page, card: string, path: string): Promise<void> {
  await testService(page, 'SetDialogPath', path);
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: card }) })
    .getByRole('button', { name: 'Escolher arquivo…' })
    .click();
}

async function backToTerminal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeHidden();
}

test.beforeAll(async () => {
  await up();
});

// Liga quando o Go entregar ImportService e a origem OpenSSH (cartões 46 e 47).
test.fixme('importa o ~/.ssh/config com prévia, conecta pela chave, ignora duplicados e desfaz', async () => {
  const app = await launchApp();
  const dir = mkdtempSync(join(tmpdir(), 'openhost-import-'));
  const config = sshConfig(dir);
  try {
    const { page } = app;
    await createVault(page);
    await openImportExport(page);
    await importFile(page, 'Configuração do OpenSSH', config);

    // Prévia: só hosts concretos, padrão de `Host *` aplicado, avisos por linha.
    const table = page.getByRole('table');
    await expect(table.getByRole('row')).toHaveCount(3); // cabeçalho + 2
    await expect(table.getByRole('textbox', { name: 'Usuário: pw-cfg' })).toHaveValue('keyuser');
    await expect(table.getByText('Chave não encontrada; vai pedir senha')).toBeVisible();
    await expect(table.getByText('ProxyJump não é importado')).toBeVisible();
    await expect(table.getByText(/coringa/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Importar 2 hosts' }).click();
    await expect(page.getByText('2 hosts criados')).toBeVisible();
    await expect(page.getByText('1 host vai pedir a senha na primeira conexão.')).toBeVisible();

    // Conecta pela chave importada, sem senha.
    await backToTerminal(page);
    await hostItem(page, 'pw-cfg').dblclick();
    await acceptHostKey(page);
    await waitConnected(page, 'pw-cfg');

    // Reimportar: tudo duplicado com "Pular"; nada a importar (SC-305).
    await openImportExport(page);
    await importFile(page, 'Configuração do OpenSSH', config);
    await expect(page.getByText('2 duplicados')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Importar 0 hosts' })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // Importar de novo com "Manter os dois" e desfazer.
    await importFile(page, 'Configuração do OpenSSH', config);
    await page.getByRole('button', { name: 'Manter os dois' }).click();
    await page.getByRole('button', { name: 'Importar 2 hosts' }).click();
    await page.getByRole('button', { name: 'Desfazer importação' }).click();
    await expect(page.getByText(/Importação desfeita/)).toBeVisible();
    await backToTerminal(page);
    await expect(hostItem(page, 'pw-cfg (importado)')).toHaveCount(0);
    await expect(hostItem(page, 'pw-cfg')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

// Liga quando o Go entregar ExportService e a leitura do `.openhost` (cartão 48).
test.fixme('exporta .openhost com chaves e reimporta num cofre novo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'openhost-export-'));
  const file = join(dir, 'backup.openhost');
  let app = await launchApp();
  try {
    const { page } = app;
    await createVault(page);
    await openImportExport(page);
    await importFile(page, 'Configuração do OpenSSH', sshConfig(dir));
    await page.getByRole('button', { name: 'Importar 2 hosts' }).click();
    await page.getByRole('button', { name: 'Importar mais' }).click();

    await page.getByRole('button', { name: 'Exportar…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Exportar hosts' });
    await dialog.getByText('Incluir chaves privadas').click();
    await dialog.getByLabel('Senha mestra do cofre').fill('senha-teste-1');
    await dialog.getByLabel('Senha do arquivo', { exact: true }).fill(FILE_PASSWORD);
    await dialog.getByLabel('Repita a senha do arquivo').fill(FILE_PASSWORD);
    await testService(page, 'SetDialogPath', file);
    await dialog.getByRole('button', { name: 'Exportar' }).click();
    await expect(page.getByText(`Salvo em ${file}`)).toBeVisible();
  } finally {
    await app.close();
  }

  app = await launchApp();
  try {
    const { page } = app;
    await createVault(page);
    await openImportExport(page);
    await importFile(page, 'Arquivo do OpenHost', file);
    const ask = page.getByRole('dialog', { name: 'Arquivo protegido' });
    await ask.getByLabel('Senha do arquivo').fill('errada-123');
    await ask.getByRole('button', { name: 'Abrir' }).click();
    await expect(ask.getByText('Senha incorreta.')).toBeVisible();
    await ask.getByLabel('Senha do arquivo').fill(FILE_PASSWORD);
    await ask.getByRole('button', { name: 'Abrir' }).click();

    await page.getByRole('button', { name: 'Importar 2 hosts' }).click();
    await expect(page.getByText('2 hosts criados')).toBeVisible();
    await backToTerminal(page);
    await hostItem(page, 'pw-cfg').dblclick();
    await acceptHostKey(page);
    await waitConnected(page, 'pw-cfg');
  } finally {
    await app.close();
  }
});

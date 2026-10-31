// SC-108 (T098): depois de um fluxo completo, nenhum segredo legível no diretório de dados —
// inclusive SQLite (.db, -wal), pasta do WebView2 e despejos de falha. SC-304 (T045): o mesmo
// depois de importar, e nos arquivos exportados sem chaves (.openhost, OpenSSH e CSV).
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { expect, test } from '@playwright/test';
import { KEYS_DIR, TEST_PASSPHRASE } from '../../../scripts/gen-test-keys.mjs';
import { filesUnder, keyFragments, scan } from '../../../scripts/lib/secrets-scan.mjs';
import { SSHD, up } from '../../../scripts/sshd.mjs';
import { launchApp, testService } from './helpers/launch';
import { waitWebViewGone } from './helpers/system';
import {
  acceptHostKey,
  addHost,
  createVault,
  expectTerminalLine,
  hostItem,
  MASTER_PASSWORD,
  sessionIdOf,
  typeInTerminal,
  unlock,
  waitConnected,
} from './helpers/ui';

const HOST_PASSWORD = 'pw-test-123';

test.beforeAll(async () => {
  await up();
});

test('nenhum segredo legível no diretório de dados após o fluxo completo', async () => {
  test.setTimeout(120_000);
  const keyPem = readFileSync(join(KEYS_DIR, 'ed25519-passphrase'), 'utf8');
  let app = await launchApp();
  const { dataDir } = app;
  try {
    const { page } = app;
    await createVault(page);

    // Host com senha guardada no cofre, conectado.
    await addHost(page, {
      label: 'pw-host',
      address: SSHD.host,
      port: SSHD.port,
      username: 'pwuser',
      password: HOST_PASSWORD,
    });
    await hostItem(page, 'pw-host').dblclick();
    await acceptHostKey(page);
    await waitConnected(page, 'pw-host');
    const pw = await sessionIdOf(page, 'pw-host');
    await typeInTerminal(page, 'pw-host', 'echo pw-ok\r');
    await expectTerminalLine(page, pw, 'pw-ok');

    // Chave com passphrase importada colando o PEM, usada numa conexão.
    await page.getByRole('button', { name: 'Credenciais e chaves…' }).first().click();
    const creds = page.getByRole('dialog', { name: 'Credenciais e chaves' });
    await creds.getByLabel('Nome', { exact: true }).fill('chave-com-senha');
    await creds.getByLabel('Ou cole a chave privada').fill(keyPem);
    await creds.getByLabel(/Senha da chave/).fill(TEST_PASSPHRASE);
    await creds.getByRole('button', { name: 'Salvar' }).click();
    await expect(creds.getByRole('listitem').filter({ hasText: 'chave-com-senha' })).toBeVisible();
    await creds.getByRole('button', { name: 'Fechar' }).last().click();
    await addHost(page, {
      label: 'key-host',
      address: SSHD.host,
      port: SSHD.port,
      username: 'keyuser',
      method: 'Chave privada',
      credential: 'chave-com-senha',
    });
    await hostItem(page, 'key-host').dblclick();
    await waitConnected(page, 'key-host');
    const key = await sessionIdOf(page, 'key-host');
    await typeInTerminal(page, 'key-host', 'whoami\r');
    await expectTerminalLine(page, key, 'keyuser');

    // Bloquear, fechar e reabrir: o que ficou em disco é o que conta.
    await page.getByRole('button', { name: 'Bloquear cofre' }).click();
    await app.close();
    app = await launchApp({ dataDir });
    await unlock(app.page);
    await app.close();
    await waitWebViewGone(dataDir);

    const files = filesUnder(dataDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => /\.db$/.test(f))).toBe(true);

    const secrets: Record<string, string> = {
      'senha mestra': MASTER_PASSWORD,
      'senha do host': HOST_PASSWORD,
      passphrase: TEST_PASSPHRASE,
    };
    keyFragments(keyPem).forEach((fragment, i) => {
      secrets[`trecho ${String(i + 1)} da chave`] = fragment;
    });

    expect(scan(files, dataDir, secrets), 'segredos legíveis encontrados').toEqual([]);

    // Sem despejos de falha nem logs do app. Os .log do WebView2 são diários do LevelDB e
    // diagnósticos do Chromium; o conteúdo deles já passou pela varredura acima.
    const webview = /^webview[\\/]/i;
    const dumps = files.filter((f) => {
      const rel = relative(dataDir, f);
      return (
        /\.dmp$/i.test(rel) ||
        /Crashpad[\\/]reports[\\/]/i.test(rel) ||
        (/\.log$/i.test(rel) && !webview.test(rel))
      );
    });
    expect(dumps.map((f) => `${relative(dataDir, f)} (${String(statSync(f).size)} B)`)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('nenhum segredo legível após importar nem nos arquivos exportados sem chaves', async () => {
  test.setTimeout(120_000);
  const keyPath = join(KEYS_DIR, 'ed25519-passphrase');
  const keyPem = readFileSync(keyPath, 'utf8');
  const out = mkdtempSync(join(tmpdir(), 'openhost-secrets-'));
  const config = join(out, 'config');
  writeFileSync(
    config,
    [
      'Host key-cfg',
      `  HostName ${SSHD.host}`,
      `  Port ${String(SSHD.port)}`,
      '  User keyuser',
      `  IdentityFile ${keyPath.replaceAll('\\', '/')}`,
      '',
    ].join('\n'),
  );
  const exported = {
    openhost: join(out, 'hosts.openhost'),
    openssh: join(out, 'hosts.config'),
    csv: join(out, 'hosts.csv'),
  };

  let app = await launchApp();
  const { dataDir } = app;
  try {
    const { page } = app;
    await createVault(page);
    await addHost(page, {
      label: 'pw-host',
      address: SSHD.host,
      port: SSHD.port,
      username: 'pwuser',
      password: HOST_PASSWORD,
    });

    // Importa o config com uma chave que pede passphrase e conecta por ela.
    await page.getByRole('button', { name: 'Importar e exportar' }).click();
    await testService(page, 'SetDialogPath', config);
    await page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Configuração do OpenSSH' }) })
      .getByRole('button', { name: 'Escolher arquivo…' })
      .click();
    await page.getByRole('button', { name: 'Importar 1 host' }).click();
    const ask = page.getByRole('dialog', { name: /^Passphrase da chave/ });
    await ask.getByLabel('Passphrase').fill(TEST_PASSPHRASE);
    await ask.getByRole('button', { name: 'Usar chave' }).click();
    await expect(page.getByText('1 host criado')).toBeVisible();
    await page.getByRole('button', { name: 'Importar mais' }).click();

    // Exporta nos três formatos, sem chaves.
    for (const [format, label] of [
      ['openhost', 'OpenHost'],
      ['openssh', 'OpenSSH'],
      ['csv', 'CSV'],
    ] as const) {
      await page.getByRole('button', { name: 'Exportar…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Exportar hosts' });
      await dialog.getByRole('radio', { name: label }).click();
      await testService(page, 'SetDialogPath', exported[format]);
      await dialog.getByRole('button', { name: 'Exportar' }).click();
      await expect(page.getByText(`Salvo em ${exported[format]}`)).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await hostItem(page, 'key-cfg').dblclick();
    await acceptHostKey(page);
    await waitConnected(page, 'key-cfg');
    const key = await sessionIdOf(page, 'key-cfg');
    await typeInTerminal(page, 'key-cfg', 'whoami\r');
    await expectTerminalLine(page, key, 'keyuser');

    await page.getByRole('button', { name: 'Bloquear cofre' }).click();
    await app.close();
    app = await launchApp({ dataDir });
    await unlock(app.page);
    await app.close();
    await waitWebViewGone(dataDir);

    const secrets: Record<string, string> = {
      'senha mestra': MASTER_PASSWORD,
      'senha do host': HOST_PASSWORD,
      passphrase: TEST_PASSPHRASE,
    };
    keyFragments(keyPem).forEach((fragment, i) => {
      secrets[`trecho ${String(i + 1)} da chave`] = fragment;
    });
    expect(scan(filesUnder(dataDir), dataDir, secrets), 'no diretório de dados').toEqual([]);
    const files = Object.values(exported);
    expect(scan(files, out, secrets), 'nos arquivos exportados').toEqual([]);
    // Sem chaves o .openhost não é criptografado: os dados do host aparecem, os segredos não.
    expect(readFileSync(exported.openhost, 'utf8')).toContain('key-cfg');
  } finally {
    await app.close();
  }
});

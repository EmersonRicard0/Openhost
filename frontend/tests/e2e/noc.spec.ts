// US3 — operação só pelo teclado: atalhos, paleta, busca e colagem (T064; FR-140 a FR-144).
import { expect, test, type Page } from '@playwright/test';
import { SSHD, up } from '../../../scripts/sshd.mjs';
import { launchApp } from './helpers/launch';
import { writeClipboard } from './helpers/system';
import {
  acceptHostKey,
  addHost,
  createVault,
  expectTerminalLine,
  sessionIdOf,
  tab,
  terminalSize,
  terminalText,
  typeInTerminal,
  waitConnected,
  waitPowerShellPrompt,
} from './helpers/ui';

const PS = 'PowerShell';

const tabs = (page: Page) => page.getByRole('tab');
const palette = (page: Page) => page.getByRole('dialog', { name: 'Paleta de comandos' });

test('atalhos de abas, fonte, busca e paleta (FR-140)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);

    // Ctrl+T abre o shell padrão (PowerShell) duas vezes.
    await page.keyboard.press('Control+T');
    await expect(tabs(page)).toHaveCount(1);
    const first = await sessionIdOf(page, PS);
    await waitPowerShellPrompt(page, first);
    await page.keyboard.press('Control+T');
    await expect(tabs(page)).toHaveCount(2);
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');

    // Ctrl+Tab / Ctrl+Shift+Tab alternam, com volta circular.
    await page.keyboard.press('Control+Tab');
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+Shift+Tab');
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Control+Shift+Tab');
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-selected', 'true');

    // Ctrl+= / Ctrl+- mudam a fonte só da aba ativa; Ctrl+0 restaura.
    const original = await terminalSize(page, first);
    await page.keyboard.press('Control+Equal');
    await page.keyboard.press('Control+Equal');
    await expect
      .poll(async () => (await terminalSize(page, first))?.cols)
      .toBeLessThan(original?.cols ?? 0);
    await page.keyboard.press('Control+0');
    await expect.poll(async () => (await terminalSize(page, first))?.cols).toBe(original?.cols);
    await page.keyboard.press('Control+Minus');
    await expect
      .poll(async () => (await terminalSize(page, first))?.cols)
      .toBeGreaterThan(original?.cols ?? 0);
    await page.keyboard.press('Control+0');

    // Ctrl+Shift+F abre a busca; Esc fecha e devolve o foco ao terminal.
    await page.keyboard.press('Control+Shift+F');
    const search = page.getByRole('search', { name: 'Buscar no terminal' });
    await expect(search).toBeVisible();
    await expect(search.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(search).toBeHidden();

    // Ctrl+K abre e fecha a paleta.
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeHidden();

    // Ctrl+W fecha a aba local sem perguntar.
    await page.keyboard.press('Control+W');
    await expect(tabs(page)).toHaveCount(1);

    // Ctrl+T não chega ao shell como ^T: o texto digitado depois continua intacto.
    await typeInTerminal(page, PS, 'Write-Host atalho-ok\r');
    const remaining = await sessionIdOf(page, PS);
    await expectTerminalLine(page, remaining, 'atalho-ok');
  } finally {
    await app.close();
  }
});

test('busca com regex e colagem de 5 linhas com confirmação (FR-142, FR-144)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await page.keyboard.press('Control+Shift+T');
    const id = await sessionIdOf(page, PS);
    await waitPowerShellPrompt(page, id);
    // A linha do comando não casa com o padrão; só as 3 de saída.
    await typeInTerminal(page, PS, '1..3 | ForEach-Object { "erro-$($_ * 101)" }\r');
    await expectTerminalLine(page, id, 'erro-303');

    await page.keyboard.press('Control+Shift+F');
    const search = page.getByRole('search', { name: 'Buscar no terminal' });
    const status = search.getByRole('status');
    await search.getByRole('textbox').fill('erro-\\d+');
    await expect(status).toHaveText('Nenhum resultado');
    await search.getByRole('button', { name: 'Expressão regular' }).click();
    await expect(status).toHaveText(/^\d de 3$/);
    const before = await status.textContent();
    await search.getByRole('textbox').press('Enter');
    await expect(status).not.toHaveText(before ?? '');
    await expect(status).toHaveText(/^\d de 3$/);
    await search.getByRole('button', { name: 'Diferenciar maiúsculas' }).click();
    await search.getByRole('textbox').fill('ERRO');
    await expect(search.getByRole('status')).toHaveText('Nenhum resultado');
    await search.getByRole('textbox').press('Escape');

    // Colar 5 linhas pede confirmação; cancelar não envia nada.
    writeClipboard(['echo cola-1', 'echo cola-2', 'echo cola-3', 'echo cola-4', 'echo cola-5']);
    await page.keyboard.press('Control+Shift+V');
    const confirm = page.getByRole('dialog', { name: 'Colar várias linhas?' });
    await expect(confirm).toContainText('5 linhas');
    await expect(confirm.getByTestId('paste-preview')).toContainText('echo cola-1');
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    expect(await terminalText(page, id)).not.toContain('cola-1');

    // Confirmar cola; o foco volta para o terminal.
    await page.keyboard.press('Control+Shift+V');
    await page.getByRole('button', { name: 'Colar 5 linhas' }).click();
    // A última linha não tem quebra: fica no prompt até o Enter, que só chega se o foco voltou.
    await page.keyboard.press('Enter');
    await expectTerminalLine(page, id, 'cola-5');
    await page.keyboard.type('Write-Host foco-de-volta\r');
    await expectTerminalLine(page, id, 'foco-de-volta');

    // Uma linha só cola direto, sem perguntar.
    writeClipboard(['Write-Host linha-unica']);
    await page.keyboard.press('Control+Shift+V');
    await page.keyboard.press('Enter');
    await expectTerminalLine(page, id, 'linha-unica');
  } finally {
    await app.close();
  }
});

test('paleta conecta num host só pelo teclado; Ctrl+W pede confirmação (FR-141)', async () => {
  await up();
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await addHost(page, {
      label: 'pw-host',
      address: SSHD.host,
      port: SSHD.port,
      username: 'pwuser',
      password: 'pw-test-123',
    });

    await page.keyboard.press('Control+K');
    await expect(palette(page)).toBeVisible();
    await page.keyboard.type('pw host');
    await expect(palette(page).getByRole('option')).toHaveCount(0);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('conectar em pw');
    await expect(palette(page).getByRole('option', { selected: true })).toContainText(
      'Conectar em pw-host',
    );
    await page.keyboard.press('Enter');
    await acceptHostKey(page);
    await waitConnected(page, 'pw-host');
    const id = await sessionIdOf(page, 'pw-host');
    await page.keyboard.type('echo pela-paleta\n');
    await expectTerminalLine(page, id, 'pela-paleta');

    await page.keyboard.press('Control+W');
    const ask = page.getByRole('dialog', { name: 'Fechar a aba?' });
    await expect(ask).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(ask).toBeHidden();
    await expect(tab(page, 'pw-host')).toBeVisible();
    await page.keyboard.press('Control+W');
    await page.keyboard.press('Enter');
    await expect(tab(page, 'pw-host')).toBeHidden();
  } finally {
    await app.close();
  }
});

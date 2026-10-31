// Ajustes de interface para NOC (specs/009, quickstart): Configurações como aba, seleção na lista,
// porta sem −/+ e nome da aba pelo prompt do equipamento.
import { expect, test, type Page } from '@playwright/test';
import * as sshd from '../../../scripts/sshd.mjs';
import { launchApp } from './helpers/launch';
import {
  acceptHostKey,
  addHost,
  chooseOption,
  createVault,
  hostItem,
  openLocalTab,
  tab,
  typeInTerminal,
  waitConnected,
} from './helpers/ui';

const { SSHD } = sshd;

const settingsTab = (page: Page) => page.getByRole('tab', { name: 'Configurações', exact: true });
const selectedTabs = (page: Page) => page.getByRole('tablist').getByRole('tab', { selected: true });

test('Configurações abrem como aba própria e fecham voltando à sessão (US2)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await openLocalTab(page, 'Prompt de Comando');
    await openLocalTab(page, 'PowerShell');

    await page.getByRole('button', { name: 'Configurações', exact: true }).click();
    await expect(settingsTab(page)).toHaveAttribute('aria-selected', 'true');
    await expect(selectedTabs(page)).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Configurações' })).toBeVisible();

    // Abrir de novo (atalho) não cria outra aba.
    await page.keyboard.press('Control+Comma');
    await expect(settingsTab(page)).toHaveCount(1);

    // Voltar a uma sessão mantém a aba Configurações aberta, sem marcar.
    await tab(page, 'Prompt de Comando').click();
    await expect(page.getByRole('region', { name: 'Configurações' })).toBeHidden();
    await expect(settingsTab(page)).toHaveAttribute('aria-selected', 'false');
    await expect(tab(page, 'Prompt de Comando')).toHaveAttribute('aria-selected', 'true');

    // Ctrl+Shift+W com as Configurações à frente fecha só elas e volta à sessão anterior.
    await settingsTab(page).click();
    await expect(page.getByRole('region', { name: 'Configurações' })).toBeVisible();
    await page.keyboard.press('Control+Shift+W');
    await expect(settingsTab(page)).toHaveCount(0);
    await expect(tab(page, 'Prompt de Comando')).toHaveAttribute('aria-selected', 'true');
    await expect(tab(page, 'PowerShell')).toBeVisible();

    // Botão de fechar da aba.
    await page.getByRole('button', { name: 'Configurações', exact: true }).click();
    await page.getByRole('button', { name: 'Fechar Configurações' }).click();
    await expect(settingsTab(page)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('porta é um campo simples e o host selecionado ganha a barra de destaque (US6, US3)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await page.getByRole('button', { name: 'Novo host' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo host' });
    const port = dialog.getByRole('spinbutton', { name: 'Porta' });
    await expect(dialog.getByRole('button', { name: 'Diminuir' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Aumentar' })).toHaveCount(0);
    await port.focus();
    await page.keyboard.type('2222');
    await expect(port).toHaveValue('2222');
    await port.press('ArrowUp');
    await expect(port).toHaveValue('2223');
    await dialog.getByLabel('Nome', { exact: true }).fill('porta-host');
    await dialog.getByLabel('Endereço', { exact: true }).fill('10.0.0.9');
    await dialog.getByLabel('Usuário', { exact: true }).fill('ops');
    await dialog.getByLabel('Senha', { exact: true }).fill('senha-porta-1');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialog).toBeHidden();
    await expect(hostItem(page, 'porta-host')).toContainText('2223');

    await hostItem(page, 'porta-host').click();
    await expect(hostItem(page, 'porta-host')).toHaveAttribute('aria-selected', 'true');
    // Barra na cor de destaque desenhada pelo indicador da lista (FR-913).
    const bar = await page
      .locator('[data-indicator]')
      .filter({ has: hostItem(page, 'porta-host') })
      .evaluate((list) => {
        const after = getComputedStyle(list, '::after');
        return { width: after.width, color: after.backgroundColor };
      });
    expect(bar.width).toBe('3px');
    expect(bar.color).not.toBe('rgba(0, 0, 0, 0)');
  } finally {
    await app.close();
  }
});

test('a aba ganha o nome do prompt do equipamento, exceto se renomeada (US5)', async () => {
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
    await hostItem(page, 'pw-host').dblclick();
    await acceptHostKey(page);
    await waitConnected(page, 'pw-host');

    // Indicador de sessão aberta no item, também na densidade compacta (FR-915).
    const live = hostItem(page, 'pw-host').getByRole('img', { name: 'Sessão aberta' });
    await expect(live).toBeVisible();
    await (
      await openSettingsSection(page, 'Aparência')
    )
      .getByRole('radio', { name: 'Compacta' })
      .click();
    await page.keyboard.press('Control+Shift+W');
    await expect(live).toBeVisible();
    expect(await hostItem(page, 'pw-host').evaluate((el) => el.clientHeight)).toBe(28);

    await typeInTerminal(page, 'pw-host', "PS1='<BNG.PINDORETAMA>'\r");
    // O nome visível muda; o rótulo do host continua no nome acessível.
    await expect(tab(page, 'pw-host')).toContainText('BNG.PINDORETAMA', { timeout: 5_000 });
    await expect(tab(page, 'pw-host')).toHaveAccessibleName(/BNG\.PINDORETAMA — pw-host/);

    await typeInTerminal(page, 'pw-host', "PS1='R1(config)#'\r");
    await expect(tab(page, 'pw-host')).toContainText('R1', { timeout: 5_000 });

    // Desligar a opção volta a aba ao rótulo do host; religar traz o prompt de novo.
    const terminal = await openSettingsSection(page, 'Terminal');
    await terminal.getByLabel('Nome da aba pelo prompt').uncheck();
    await page.keyboard.press('Control+Shift+W');
    await expect(tab(page, 'pw-host')).not.toContainText('R1');
    await (
      await openSettingsSection(page, 'Terminal')
    )
      .getByLabel('Nome da aba pelo prompt')
      .check();
    await page.keyboard.press('Control+Shift+W');
    await expect(tab(page, 'pw-host')).toContainText('R1');

    // Renomeada à mão, o prompt não muda mais o nome.
    await tab(page, 'pw-host').dblclick();
    const rename = page.getByRole('textbox', { name: 'Renomear aba' });
    await rename.fill('meu-olt');
    await rename.press('Enter');
    await typeInTerminal(page, 'meu-olt', "PS1='<OUTRO>'\r");
    await page.waitForTimeout(1_500);
    await expect(tab(page, 'meu-olt')).toContainText('meu-olt');
    await expect(tab(page, 'meu-olt')).not.toContainText('OUTRO');
  } finally {
    await app.close();
  }
});

async function openSettingsSection(page: Page, section: string) {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const region = page.getByRole('region', { name: 'Configurações' });
  await region.getByRole('button', { name: section, exact: true }).click();
  return region;
}

test('ambiente colore a aba e a borda e muda sem reconectar (US1)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await page.getByRole('button', { name: 'Novo host' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo host' });
    await dialog.getByLabel('Nome', { exact: true }).fill('prod-olt');
    await dialog.getByLabel('Endereço', { exact: true }).fill(SSHD.host);
    await dialog.getByLabel('Porta', { exact: true }).fill(String(SSHD.port));
    await dialog.getByLabel('Usuário', { exact: true }).fill('pwuser');
    await dialog.getByLabel('Senha', { exact: true }).fill('pw-test-123');
    await chooseOption(dialog, 'Ambiente', 'Produção');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialog).toBeHidden();

    await hostItem(page, 'prod-olt').dblclick();
    await acceptHostKey(page);
    await waitConnected(page, 'prod-olt');
    await expect(tab(page, 'prod-olt')).toHaveAttribute('data-environment', 'red');
    await expect(tab(page, 'prod-olt')).toHaveAccessibleName(/ambiente Produção/);
    await expect(page.locator('[data-environment="red"]').nth(1)).toBeVisible();

    await hostItem(page, 'prod-olt').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar host' });
    await chooseOption(edit, 'Ambiente', 'Laboratório');
    await edit.getByRole('button', { name: 'Salvar' }).click();
    await expect(edit).toBeHidden();
    await expect(tab(page, 'prod-olt')).toHaveAttribute('data-environment', 'green');
    await expect(tab(page, 'prod-olt')).toHaveAccessibleName(/ambiente Laboratório/);
    await waitConnected(page, 'prod-olt');
  } finally {
    await app.close();
  }
});

test('tags e notas ficam no host e entram na busca; repetida é recusada (US4)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await page.getByRole('button', { name: 'Novo host' }).click();
    const dialog = page.getByRole('dialog', { name: 'Novo host' });
    await dialog.getByLabel('Nome', { exact: true }).fill('olt-centro');
    await dialog.getByLabel('Endereço', { exact: true }).fill('10.30.0.1');
    await dialog.getByLabel('Usuário', { exact: true }).fill('ops');
    await dialog.getByLabel('Senha', { exact: true }).fill('senha-olt-1');
    const tags = dialog.getByLabel('Tags', { exact: true });
    await tags.fill('olt');
    await tags.press('Enter');
    await tags.fill('cliente-x,');
    await expect(dialog.locator('[data-tag]')).toHaveText(['olt', 'cliente-x']);
    await tags.fill('OLT');
    await tags.press('Enter');
    await expect(dialog).toContainText('Essa tag já está no host.');
    await tags.fill('');
    await dialog.getByLabel('Notas', { exact: true }).fill('VLAN 100 no uplink');
    await dialog.getByRole('button', { name: 'Salvar' }).click();
    await expect(dialog).toBeHidden();

    await expect(hostItem(page, 'olt-centro').locator('[data-tag]')).toHaveText([
      'olt',
      'cliente-x',
    ]);
    const search = page.getByRole('searchbox', { name: 'Buscar hosts' });
    await search.fill('vlan 100');
    await expect(hostItem(page, 'olt-centro')).toBeVisible();
    await search.fill('cliente-x');
    await expect(hostItem(page, 'olt-centro')).toBeVisible();
    await search.fill('');

    // Gravado no cofre: reabrir o editor traz tags e nota.
    await hostItem(page, 'olt-centro').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar host' });
    await expect(edit.getByRole('button', { name: 'Remover tag olt' })).toBeVisible();
    await expect(edit.getByLabel('Notas', { exact: true })).toHaveValue('VLAN 100 no uplink');
  } finally {
    await app.close();
  }
});

test('densidade compacta deixa cada host numa linha de 28 px (US3)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await addHost(page, {
      label: 'sw-compacto',
      address: '10.31.0.1',
      port: 22,
      username: 'ops',
      password: 'senha-sw-1',
    });
    const height = () => hostItem(page, 'sw-compacto').evaluate((el) => el.clientHeight);
    expect(await height()).toBe(44);
    const region = await openSettingsSection(page, 'Aparência');
    await region.getByRole('radio', { name: 'Compacta' }).click();
    await expect.poll(height).toBe(28);
    await page.keyboard.press('Control+Shift+W');
    await expect(hostItem(page, 'sw-compacto')).toBeVisible();
    expect(await height()).toBe(28);
  } finally {
    await app.close();
  }
});

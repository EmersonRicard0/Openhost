// Animações (specs/015): abertura com a marca, sem atrasar o primeiro campo.
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers/launch';
import {
  addHost,
  createVault,
  expectTerminalLine,
  hostItem,
  terminalPanel,
  unlock,
  unlockForm,
} from './helpers/ui';

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

test('aba nova aceita digitação na hora, com a entrada animando (US3, SC-1504)', async () => {
  const app = await launchApp({ motion: true });
  const { page } = app;
  try {
    await createVault(page);
    const ids = () =>
      page
        .locator('[data-session-id]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-session-id') ?? ''));
    for (let i = 0; i < 20; i++) {
      const before = await ids();
      await page.getByRole('button', { name: 'Novo terminal local' }).click();
      await page.getByRole('menuitem', { name: 'Prompt de Comando', exact: true }).click();
      // Sem esperar o prompt nem o fim da animação da aba.
      await page.keyboard.type(`echo ok${String(i)}\r`);
      let id = '';
      await expect
        .poll(async () => {
          id = (await ids()).find((x) => !before.includes(x)) ?? '';
          return id;
        })
        .not.toBe('');
      await expectTerminalLine(page, id, `ok${String(i)}`);
    }
  } finally {
    await app.close();
  }
});

test('indicador de conexão até o erro (US3, FR-1512)', async () => {
  test.setTimeout(120_000);
  const app = await launchApp({ motion: true });
  const { page } = app;
  try {
    await createVault(page);
    // Endereço que não responde: fica conectando até o tempo limite, sem pedido de chave nem senha.
    await addHost(page, {
      label: 'fechado',
      address: '10.255.255.1',
      port: 22,
      username: 'x',
      method: 'Perguntar ao conectar',
    });
    await hostItem(page, 'fechado').dblclick();
    const panel = terminalPanel(page, 'fechado');
    await expect(panel.getByTestId('connecting')).toHaveCount(1);
    await expect(panel.getByTestId('connecting')).toHaveCount(0, { timeout: 60_000 });
    await expect(panel.getByRole('status')).toContainText('Desconectado');
  } finally {
    await app.close();
  }
});

test('preferência: Desligadas zera tudo, Reduzidas sem deslocamento, e fica salva (US5)', async () => {
  let app = await launchApp({ motion: true });
  const { dataDir } = app;
  const choose = async (label: string) => {
    await app.page.getByRole('button', { name: 'Configurações', exact: true }).click();
    const region = app.page.getByRole('region', { name: 'Configurações' });
    await region.getByRole('button', { name: 'Aparência', exact: true }).click();
    await region.getByRole('radio', { name: label, exact: true }).click();
  };
  try {
    await createVault(app.page);
    await choose('Desligadas');
    await expect(app.page.locator('html')).toHaveAttribute('data-motion', 'off');
    // Nenhum elemento com duração de animação ou transição (SC-1507).
    const moving = await app.page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((el) => {
        const cs = getComputedStyle(el);
        const nonZero = (v: string) => v.split(',').some((d) => Number.parseFloat(d) > 0);
        return nonZero(cs.animationDuration) || nonZero(cs.transitionDuration);
      }).length,
    );
    expect(moving).toBe(0);

    await choose('Reduzidas');
    await expect(app.page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    const shift = await app.page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--motion-shift').trim(),
    );
    expect(shift).toBe('0');
  } finally {
    await app.close();
  }

  // Continua depois de reiniciar (só neste computador, FR-1518).
  app = await launchApp({ dataDir, motion: true });
  try {
    await unlock(app.page);
    await expect(app.page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  } finally {
    await app.close();
  }
});

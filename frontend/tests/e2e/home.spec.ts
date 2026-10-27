// Tela inicial e conexão rápida (specs/010, quickstart). A sessão rápida, os favoritos e os
// recentes dependem do lado Go (card 73); aqui fica o que já roda com o app atual.
import { expect, test, type Page } from '@playwright/test';
import { SSHD, up } from '../../../scripts/sshd.mjs';
import { launchApp } from './helpers/launch';
import {
  acceptHostKey,
  addHost,
  createVault,
  hostItem,
  tab,
  unlock,
  waitConnected,
} from './helpers/ui';

const home = (page: Page) => page.getByRole('region', { name: 'Início' });
const quickInput = (page: Page) => page.getByRole('combobox', { name: 'Conectar a um host' });

test.beforeAll(async () => {
  await up();
});

test('conexão rápida autentica sem salvar senha e oferece salvar como host', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await quickInput(page).fill(`pwuser@${SSHD.host}:${String(SSHD.port)}`);
    await quickInput(page).press('Enter');
    await acceptHostKey(page);
    const prompt = page.getByRole('dialog');
    await prompt.getByRole('textbox').fill('pw-test-123');
    await prompt.getByRole('button', { name: 'Enviar' }).click();

    const title = `pwuser@${SSHD.host}:${String(SSHD.port)}`;
    await waitConnected(page, title);
    await tab(page, title).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Salvar como host' }).click();
    const form = page.getByRole('dialog', { name: 'Novo host' });
    await expect(form.getByLabel('Endereço', { exact: true })).toHaveValue(SSHD.host);
    await expect(form.getByLabel('Porta', { exact: true })).toHaveValue(String(SSHD.port));
    await expect(form.getByLabel('Usuário', { exact: true })).toHaveValue('pwuser');
    await expect(form.getByLabel('Senha', { exact: true })).toHaveValue('');
    await form.getByRole('button', { name: 'Cancelar' }).click();

    await tab(page, title)
      .getByRole('button', { name: `Fechar aba ${title}` })
      .click();
    await expect(home(page).getByRole('region', { name: 'Recentes' })).toContainText(
      'Conexão rápida',
    );
  } finally {
    await app.close();
  }
});

test('recentes ordenam conexões e favorito continua após reiniciar', async () => {
  let app = await launchApp();
  const dataDir = app.dataDir;
  try {
    const { page } = app;
    await createVault(page);
    await addHost(page, {
      label: 'Host A',
      address: SSHD.host,
      port: SSHD.port,
      username: 'pwuser',
      password: 'pw-test-123',
    });
    await addHost(page, {
      label: 'Host B',
      address: SSHD.host,
      port: SSHD.port,
      username: 'pwuser',
      password: 'pw-test-123',
    });

    for (const label of ['Host A', 'Host B']) {
      await hostItem(page, label).dblclick();
      if (label === 'Host A') await acceptHostKey(page);
      await waitConnected(page, label);
      await tab(page, label)
        .getByRole('button', { name: `Fechar aba ${label}` })
        .click();
      await expect(home(page)).toBeVisible();
    }

    const recents = home(page).getByRole('region', { name: 'Recentes' });
    const recentLabels = await recents
      .locator('button')
      .evaluateAll((buttons) =>
        buttons
          .map((button) => button.getAttribute('aria-label'))
          .filter((label) => label?.startsWith('Host ') && label.includes(',')),
      );
    expect(recentLabels).toEqual([
      'Host B, pwuser@127.0.0.1:2222',
      'Host A, pwuser@127.0.0.1:2222',
    ]);
    await recents.getByRole('button', { name: 'Favoritar Host A' }).click();
    await expect(
      home(page)
        .getByRole('region', { name: 'Favoritos' })
        .getByRole('button', { name: /^Host A,/ }),
    ).toBeVisible();
    await expect(recents.getByRole('button', { name: /^Host A,/ })).toHaveCount(0);
    await expect(recents.getByRole('button', { name: /^Host B,/ })).toBeVisible();

    await app.close();
    app = await launchApp({ dataDir });
    await unlock(app.page);
    await expect(home(app.page)).toBeVisible();
    await expect(
      home(app.page)
        .getByRole('region', { name: 'Favoritos' })
        .getByRole('button', { name: /^Host A,/ }),
    ).toBeVisible();
    await expect(
      home(app.page)
        .getByRole('region', { name: 'Recentes' })
        .getByRole('button', { name: /^Host B,/ }),
    ).toBeVisible();
  } finally {
    await app.close();
  }
});

test('tela inicial: barra, erros de formato, pergunta de usuário e Ctrl+L (US1, US2)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await expect(home(page)).toBeVisible();
    await expect(home(page)).toContainText('Os hosts que você favoritar');

    // Ctrl+L foca a barra com a tela inicial à frente.
    await page.getByRole('heading', { name: 'Hosts' }).click();
    await page.keyboard.press('Control+L');
    await expect(quickInput(page)).toBeFocused();

    await quickInput(page).fill('olt:70000');
    await quickInput(page).press('Enter');
    await expect(home(page).getByRole('alert')).toHaveText('Porta inválida: use de 1 a 65535.');
    await expect(quickInput(page)).toHaveAttribute('aria-invalid', 'true');

    await quickInput(page).fill('ssh -i chave olt');
    await quickInput(page).press('Enter');
    await expect(home(page).getByRole('alert')).toHaveText(
      'Só as opções -p e -l do ssh são aceitas aqui.',
    );

    // Alvo sem usuário pergunta antes de conectar; cancelar não abre aba.
    await quickInput(page).fill('10.9.9.9:2200');
    await quickInput(page).press('Enter');
    const ask = page.getByRole('dialog', { name: 'Usuário para 10.9.9.9:2200' });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole('button', { name: 'Conectar' })).toBeDisabled();
    await ask.getByRole('button', { name: 'Cancelar' }).click();
    await expect(ask).toBeHidden();
    await expect(page.getByRole('tablist').getByRole('tab')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('sugestões abrem o host salvo e o mesmo destino digitado reusa o cadastro (US3, FR-1005)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await addHost(page, {
      label: 'olt-pindoretama',
      address: SSHD.host,
      port: SSHD.port,
      username: 'pwuser',
      password: 'pw-test-123',
    });
    await addHost(page, {
      label: 'bng-centro',
      address: '10.20.0.1',
      port: 22,
      username: 'ops',
      password: 'senha-bng-1',
    });

    await quickInput(page).fill('pindo');
    const list = page.getByRole('listbox', { name: 'Hosts sugeridos' });
    await expect(list.getByRole('option')).toHaveCount(1);
    await expect(list.locator('mark').first()).toHaveText('pindo');
    await quickInput(page).press('ArrowDown');
    await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await quickInput(page).press('Escape');
    await expect(list).toBeHidden();

    // Esc fechou a lista: Enter com o destino do host salvo usa o cadastro (com a senha dele).
    await quickInput(page).fill(`${SSHD.host}:${String(SSHD.port)}`);
    await quickInput(page).press('Escape');
    await quickInput(page).press('Enter');
    await acceptHostKey(page);
    await waitConnected(page, 'olt-pindoretama');
    await expect(home(page)).toBeHidden();

    // Com a sessão aberta, Ctrl+L é do terminal: a barra não existe e nada rouba o foco.
    await page.keyboard.press('Control+L');
    await expect(quickInput(page)).toHaveCount(0);
    await expect(tab(page, 'olt-pindoretama')).toHaveAttribute('aria-selected', 'true');
  } finally {
    await app.close();
  }
});

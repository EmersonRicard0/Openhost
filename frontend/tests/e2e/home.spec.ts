// Tela inicial e conexão rápida (specs/010, quickstart). A sessão rápida, os favoritos e os
// recentes dependem do lado Go (card 73); aqui fica o que já roda com o app atual.
import { expect, test, type Page } from '@playwright/test';
import * as sshd from '../../../scripts/sshd.mjs';
import { launchApp } from './helpers/launch';
import { acceptHostKey, addHost, createVault, tab, waitConnected } from './helpers/ui';

const { SSHD } = sshd;

const home = (page: Page) => page.getByRole('region', { name: 'Início' });
const quickInput = (page: Page) => page.getByRole('combobox', { name: 'Conectar a um host' });

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

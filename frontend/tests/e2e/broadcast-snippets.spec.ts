// Digitar no grupo inteiro e biblioteca de comandos (specs/012, quickstart).
import { expect, test, type Locator, type Page } from '@playwright/test';
import * as sshd from '../../../scripts/sshd.mjs';
import { launchApp } from './helpers/launch';
import {
  acceptHostKey,
  chooseOption,
  createVault,
  expectTerminalLine,
  hostItem,
  terminalText,
  waitConnected,
} from './helpers/ui';

const { SSHD } = sshd;

const tabs = (page: Page) => page.getByRole('tab');
const pane = (page: Page, id: string) => page.locator(`[data-pane][data-session-id="${id}"]`);
const header = (page: Page, id: string) => pane(page, id).locator('[data-pane-header]');

/** Abre um Prompt de Comando e devolve o id da sessão nova, com o prompt pronto. */
async function openCmd(page: Page): Promise<string> {
  const ids = () =>
    page
      .locator('[data-session-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-session-id') ?? ''));
  const before = await ids();
  await page.getByRole('button', { name: 'Novo terminal local' }).click();
  await page.getByRole('menuitem', { name: 'Prompt de Comando', exact: true }).click();
  let id = '';
  await expect
    .poll(async () => {
      id = (await ids()).find((x) => !before.includes(x)) ?? '';
      return id;
    })
    .not.toBe('');
  await expect
    .poll(async () => /[A-Z]:\\.*>$/m.test(await terminalText(page, id)), { timeout: 30_000 })
    .toBe(true);
  return id;
}

/** Junta a aba `index` ao item cujo menu tem o nome `target`, pelo menu "Agrupar com". */
async function groupWith(page: Page, index: number, target: string | RegExp) {
  await tabs(page).nth(index).click({ button: 'right' });
  await page.getByRole('menuitem', { name: target }).first().click();
}

async function typeIn(page: Page, id: string, text: string) {
  await pane(page, id).locator('.xterm').click();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

/** Espera `word` no painel e confere que ele não apareceu nos de `absent`. */
async function expectOnly(page: Page, word: string, present: string[], absent: string[]) {
  for (const id of present) await expectTerminalLine(page, id, word);
  for (const id of absent)
    expect((await terminalText(page, id)).split('\n').map((l) => l.trimEnd())).not.toContain(word);
}

async function fakeClipboard(page: Page, text: string) {
  await page.evaluate((value) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve(value),
      },
    });
  }, text);
}

const broadcastButton = (scope: Page | Locator) =>
  scope.getByRole('button', { name: 'Digitar no grupo', exact: true });

test('digitar uma vez chega aos painéis marcados do grupo (US1)', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    const a = await openCmd(page);
    const b = await openCmd(page);
    const c = await openCmd(page);
    await groupWith(page, 1, 'Agrupar com Prompt de Comando');
    await groupWith(page, 1, 'Agrupar com Prompt de Comando e mais 1');
    await expect(page.locator('[data-pane]')).toHaveCount(3);

    // Ligar pelo botão da aba: C (ativo) transmite, A e B recebem.
    const button = broadcastButton(page);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(tabs(page).first()).toHaveAccessibleName(/digitando no grupo/);
    await expect(header(page, c)).toHaveAttribute('data-broadcast', 'send');
    await expect(header(page, c).getByRole('status')).toHaveText('Transmitindo para 2 painéis');
    for (const id of [a, b]) {
      await expect(header(page, id)).toHaveAttribute('data-broadcast', 'receive');
      await expect(header(page, id).getByRole('status')).toHaveText('Recebendo do grupo');
    }
    await typeIn(page, c, 'echo b1');
    await expectOnly(page, 'b1', [a, b, c], []);

    // Desmarcar B: ele para de receber, sem desligar o modo.
    await header(page, b).getByRole('checkbox', { name: 'Receber do grupo' }).uncheck();
    await expect(header(page, b)).not.toHaveAttribute('data-broadcast', /.+/);
    await expect(header(page, c).getByRole('status')).toHaveText('Transmitindo para 1 painel');
    await typeIn(page, c, 'echo b2');
    await expectOnly(page, 'b2', [a, c], [b]);

    // Trocar o painel ativo: a transmissão sai do novo ativo.
    await typeIn(page, a, 'echo b3');
    await expectOnly(page, 'b3', [a, c], [b]);

    // Separado do grupo, C nunca mais recebe.
    await header(page, c).getByRole('button', { name: 'Separar em nova aba' }).click();
    await tabs(page).first().click();
    await expect(page.locator('[data-pane]')).toHaveCount(2);
    await header(page, b).getByRole('checkbox', { name: 'Receber do grupo' }).check();
    await typeIn(page, a, 'echo b4');
    await expectOnly(page, 'b4', [a, b], [c]);

    // Desligar pelo atalho.
    await pane(page, a).locator('.xterm').click();
    await page.keyboard.press('Control+Shift+G');
    await expect(broadcastButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-broadcast]')).toHaveCount(0);
    await typeIn(page, a, 'echo b5');
    await expectOnly(page, 'b5', [a], [b, c]);
  } finally {
    await app.close();
  }
});

test('produção pede confirmação e colar texto grande no grupo também (US2)', async () => {
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

    const local = await openCmd(page);
    await hostItem(page, 'prod-olt').dblclick();
    await acceptHostKey(page);
    await waitConnected(page, 'prod-olt');
    await groupWith(page, 1, /^Agrupar com /);
    await expect(page.locator('[data-pane]')).toHaveCount(2);

    // Ligar com painel de produção: confirmação com o rótulo; cancelar mantém desligado.
    await broadcastButton(page).click();
    const confirm = page.getByRole('dialog', { name: 'Digitar em produção?' });
    await expect(confirm).toContainText('prod-olt');
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(confirm).toBeHidden();
    await expect(broadcastButton(page)).toHaveAttribute('aria-pressed', 'false');

    await broadcastButton(page).click();
    await confirm.getByRole('button', { name: 'Transmitir mesmo assim' }).click();
    await expect(broadcastButton(page)).toHaveAttribute('aria-pressed', 'true');
    // A sessão SSH entrou por último e é o painel ativo; o local recebe.
    const ids = await page
      .locator('[data-pane]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-session-id') ?? ''));
    const prod = ids.find((id) => id !== local) ?? '';
    await expect(header(page, prod).getByRole('status')).toHaveText('Transmitindo para 1 painel');
    await expect(header(page, local).getByRole('status')).toHaveText('Recebendo do grupo');
    // Com o local ativo, é o painel de produção que recebe e a faixa diz isso.
    await pane(page, local).locator('.xterm').click();
    await expect(header(page, prod).getByRole('status')).toHaveText(
      'Recebendo do grupo · Produção',
    );

    // Colar 3 linhas no painel local: confirmação com o número de painéis; cancelar não envia.
    await fakeClipboard(page, 'echo cola-1\necho cola-2\necho cola-3');
    await pane(page, local).locator('.xterm').click({ button: 'right' });
    const paste = page.getByRole('dialog', { name: 'Colar no grupo?' });
    await expect(paste).toContainText('Vai para 2 painéis');
    await paste.getByRole('button', { name: 'Cancelar' }).click();
    await expect(paste).toBeHidden();
    expect(await terminalText(page, local)).not.toContain('cola-1');

    // Linha curta vai direto, sem confirmação.
    await fakeClipboard(page, 'echo curta');
    await pane(page, local).locator('.xterm').click({ button: 'right' });
    await expect(paste).toBeHidden();
    await page.keyboard.press('Enter');
    await expectTerminalLine(page, local, 'curta');
  } finally {
    await app.close();
  }
});

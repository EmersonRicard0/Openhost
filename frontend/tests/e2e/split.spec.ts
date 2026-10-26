// Grupos de terminais na mesma aba (specs/006, quickstart §2): juntar arrastando a aba, até 4.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { launchApp, testService } from './helpers/launch';
import { createVault, expectTerminalLine, terminalSize } from './helpers/ui';
type Side = 'left' | 'right' | 'top' | 'bottom';

interface Size {
  cols: number;
  rows: number;
}

const tabs = (page: Page) => page.getByRole('tab');
const pane = (page: Page, id: string) => page.locator(`[data-pane][data-session-id="${id}"]`);

/** Abre um Prompt de Comando e devolve o id da sessão nova. */
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
    .poll(async () => /[A-Z]:\\.*>$/m.test(await probeText(page, id)), { timeout: 30_000 })
    .toBe(true);
  return id;
}

async function probeText(page: Page, id: string): Promise<string> {
  return page.evaluate((sid) => window.__shellvaultProbe.text(sid) ?? '', id);
}

async function box(target: Locator) {
  const b = await target.boundingBox();
  if (!b) throw new Error('sem caixa');
  return b;
}

/** Arrasta a aba até o lado pedido do terminal `targetId`; sem soltar, devolve antes do `up`. */
async function dragTab(page: Page, source: Locator, targetId: string, side: Side, drop = true) {
  const from = await box(source);
  const to = await box(page.locator(`[data-session-id="${targetId}"]`));
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await expect(page.locator('[data-drop-layer]')).toBeVisible();
  const fx = side === 'left' ? 0.15 : side === 'right' ? 0.85 : 0.5;
  const fy = side === 'top' ? 0.15 : side === 'bottom' ? 0.85 : 0.5;
  await page.mouse.move(to.x + to.width * fx, to.y + to.height * fy, { steps: 8 });
  if (drop) await page.mouse.up();
}

async function expectServerMatches(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const [xterm, server] = await Promise.all([
        terminalSize(page, id),
        testService<Size | null>(page, 'ServerSizeOf', id),
      ]);
      return xterm !== null && JSON.stringify(server) === JSON.stringify(xterm);
    })
    .toBe(true);
}

async function echoIn(page: Page, id: string, word: string): Promise<void> {
  await pane(page, id).locator('.xterm').click();
  await page.keyboard.type(`echo ${word}`);
  await page.keyboard.press('Enter');
  await expectTerminalLine(page, id, word);
}

test('arrastar a aba sobre o terminal junta as sessões, sem reconectar, até 4 (US1)', async () => {
  const app = await launchApp();
  try {
    const { page } = app;
    await createVault(page);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await openCmd(page));
    const [a, b, c, d, e] = ids as [string, string, string, string, string];

    // Cenário 1: com A ativa, a aba de B solta à direita do terminal de A.
    await tabs(page).nth(0).click();
    await dragTab(page, tabs(page).nth(1), a, 'right');
    await expect(page.locator('[data-pane]')).toHaveCount(2);
    await expect(tabs(page)).toHaveCount(4);
    await expect(page.getByRole('tab', { name: 'Prompt de Comando e mais 1' })).toBeVisible();
    const [boxA, boxB] = [await box(pane(page, a)), await box(pane(page, b))];
    expect(boxB.x).toBeGreaterThan(boxA.x + boxA.width / 2);
    expect(Math.abs(boxB.y - boxA.y)).toBeLessThan(2);
    // Mesmas sessões (ids iguais), vivas, com o tamanho certo no servidor.
    await echoIn(page, a, 'painel-a');
    await echoIn(page, b, 'painel-b');
    await expectServerMatches(page, a);
    await expectServerMatches(page, b);

    // Cenário 2: C embaixo de A e D embaixo de B formam um 2×2.
    await dragTab(page, tabs(page).nth(1), a, 'bottom');
    await dragTab(page, tabs(page).nth(1), b, 'bottom');
    await expect(page.locator('[data-pane]')).toHaveCount(4);
    await expect(page.getByRole('tab', { name: 'Prompt de Comando e mais 3' })).toBeVisible();
    for (const id of [a, b, c, d]) await expectServerMatches(page, id);
    await echoIn(page, d, 'painel-d');

    // A quinta é recusada com o motivo, e E continua aba própria.
    await dragTab(page, tabs(page).nth(1), a, 'right', false);
    await expect(
      page.getByRole('status').filter({ hasText: 'Máximo de 4 sessões por grupo' }),
    ).toBeVisible();
    await expect(page.locator('[data-drop-preview]')).toHaveCount(0);
    await page.mouse.up();
    await expect(page.locator('[data-pane]')).toHaveCount(4);
    await expect(tabs(page)).toHaveCount(2);
    await expect(page.locator(`[data-session-id="${e}"]`)).toHaveAttribute('role', 'tabpanel');
  } finally {
    await app.close();
  }
});

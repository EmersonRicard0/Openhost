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
  await page.locator(`[data-session-id="${id}"] .xterm`).click();
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

test('agrupa com qualquer sessão da barra, não só a ativa', async () => {
  const app = await launchApp();
  try {
    const { page } = app;
    await createVault(page);
    const a = await openCmd(page);
    const b = await openCmd(page);
    const c = await openCmd(page);
    const d = await openCmd(page);

    // Com A ativa, segurar a aba de C sobre a de B abre B; soltar ali junta C a B.
    await tabs(page).nth(0).click();
    const from = await box(tabs(page).nth(2));
    const over = await box(tabs(page).nth(1));
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 8 });
    await expect(page.locator(`[data-session-id="${b}"]`)).toBeVisible();
    const to = await box(page.locator(`[data-session-id="${b}"]`));
    await page.mouse.move(to.x + to.width * 0.85, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(pane(page, b)).toBeVisible();
    await expect(pane(page, c)).toBeVisible();
    await expect(pane(page, a)).toHaveCount(0);

    // Pelo menu da aba: D entra no grupo de B e C sem ativá-lo antes.
    await tabs(page).nth(0).click();
    await tabs(page).nth(2).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Agrupar com Prompt de Comando e mais 1' }).click();
    for (const id of [b, c, d]) await expect(pane(page, id)).toBeVisible();
    await expect(tabs(page)).toHaveCount(2);
  } finally {
    await app.close();
  }
});

test('divisória ajusta os dois terminais e o teclado move o foco entre painéis (US2)', async () => {
  const app = await launchApp();
  try {
    const { page } = app;
    await createVault(page);
    const a = await openCmd(page);
    const b = await openCmd(page);
    await tabs(page).nth(0).click();
    await dragTab(page, tabs(page).nth(1), a, 'right');
    await expect(page.locator('[data-pane]')).toHaveCount(2);

    // Arrastar a divisória para a esquerda encolhe A e alarga B; o servidor acompanha.
    const divider = page.getByRole('separator', { name: 'Redimensionar painéis' });
    await expect(divider).toHaveAttribute('aria-valuenow', '50');
    const before = await terminalSize(page, a);
    const line = await box(divider);
    await page.mouse.move(line.x + line.width / 2, line.y + line.height / 2);
    await page.mouse.down();
    await page.mouse.move(line.x - 150, line.y + line.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => Number(await divider.getAttribute('aria-valuenow')))
      .toBeLessThan(50);
    await expect
      .poll(async () => (await terminalSize(page, a))?.cols)
      .toBeLessThan(before?.cols ?? 0);
    await expectServerMatches(page, a);
    await expectServerMatches(page, b);

    // Dois cliques igualam; setas mudam 5%.
    await divider.dblclick();
    await expect(divider).toHaveAttribute('aria-valuenow', '50');
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '55');

    // Foco pelo teclado: o painel destacado é o que recebe a digitação.
    await pane(page, b).locator('.xterm').click();
    await expect(pane(page, b)).toHaveAttribute('data-focused', '');
    await page.keyboard.press('Control+Alt+ArrowLeft');
    await expect(pane(page, a)).toHaveAttribute('data-focused', '');
    await expect(pane(page, b)).not.toHaveAttribute('data-focused');
    await page.keyboard.type('echo foco-a');
    await page.keyboard.press('Enter');
    await expectTerminalLine(page, a, 'foco-a');
    await page.keyboard.press('Control+Alt+ArrowRight');
    await expect(pane(page, b)).toHaveAttribute('data-focused', '');
    await page.keyboard.type('echo foco-b');
    await page.keyboard.press('Enter');
    await expectTerminalLine(page, b, 'foco-b');
    expect(await probeText(page, a)).not.toContain('foco-b');
  } finally {
    await app.close();
  }
});

test('reorganizar pelo cabeçalho, separar sem reconectar e fechar painel (US3, US4)', async () => {
  const app = await launchApp();
  try {
    const { page } = app;
    await createVault(page);
    const a = await openCmd(page);
    const b = await openCmd(page);
    const c = await openCmd(page);
    await tabs(page).nth(0).click();
    await dragTab(page, tabs(page).nth(1), a, 'right');
    await dragTab(page, tabs(page).nth(1), a, 'bottom');
    await expect(page.locator('[data-pane]')).toHaveCount(3);
    const boxA = await box(pane(page, a));
    expect((await box(pane(page, c))).x).toBeLessThan(boxA.x + boxA.width / 2);

    // O cabeçalho de C solto embaixo de B leva C para a coluna da direita.
    await dragTab(page, pane(page, c).locator('[data-pane-header]'), b, 'bottom');
    await expect
      .poll(async () => (await box(pane(page, c))).x)
      .toBeGreaterThan((await box(pane(page, a))).x + 50);
    await expect(page.locator('[data-pane]')).toHaveCount(3);

    // Separar B: volta a ser aba própria, mesma sessão, conteúdo intacto.
    await echoIn(page, b, 'antes-de-separar');
    await pane(page, b).getByRole('button', { name: 'Separar em nova aba' }).click();
    // A aba separada fica ativa; o grupo restante (A e C) segue na barra.
    await expect(page.locator('[data-pane]')).toHaveCount(0);
    await expect(tabs(page)).toHaveCount(2);
    const solo = page.locator(`[data-session-id="${b}"]`);
    await expect(solo).toHaveAttribute('role', 'tabpanel');
    await expect(solo).toBeVisible();
    expect(await probeText(page, b)).toContain('antes-de-separar');
    await echoIn(page, b, 'depois-de-separar');

    // Fechar o painel C encerra só C; com uma sessão restante o grupo se desfaz.
    await page.getByRole('tab', { name: 'Prompt de Comando e mais 1' }).click();
    await expect(page.locator('[data-pane]')).toHaveCount(2);
    await pane(page, c).getByRole('button', { name: 'Fechar painel' }).click();
    await expect(page.locator(`[data-session-id="${c}"]`)).toHaveCount(0);
    await expect(page.locator('[data-pane]')).toHaveCount(0);
    await expect(page.locator(`[data-session-id="${a}"]`)).toHaveAttribute('role', 'tabpanel');
    await expect(tabs(page)).toHaveCount(2);
  } finally {
    await app.close();
  }
});

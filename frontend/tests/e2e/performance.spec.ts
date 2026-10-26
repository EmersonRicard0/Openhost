// SC-112 — troca de aba < 100 ms com 20 abas (uma com saída contínua) e busca em 1.000 hosts < 200 ms (T099).
// SC-302 — prévia de importação com 1.000 hosts na tela ≤ 3 s e gravação ≤ 5 s (003, T046).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp, testService } from './helpers/launch';
import { createVault, hostItem, unlock, unlockForm } from './helpers/ui';

const TABS = 20;
const HOSTS = 1_000;
const SWITCH_MS = 100;
const SEARCH_MS = 200;
const PREVIEW_MS = 3_000;
const COMMIT_MS = 5_000;

/** Clica na aba `index` e mede até o painel dela estar visível e o quadro seguinte pintado. */
async function switchTime(page: Page, index: number): Promise<number> {
  return page.evaluate(async (i) => {
    const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
    const tabs = [...document.querySelectorAll<HTMLElement>('[role=tab]')];
    const panels = [...document.querySelectorAll<HTMLElement>('[role=tabpanel][data-session-id]')];
    const target = tabs[i];
    // Abas recém-abertas: os painéis seguem a ordem das abas.
    const panel = panels[i];
    if (!target) throw new Error(`aba ${String(i)} não existe`);
    const t0 = performance.now();
    target.click();
    for (let n = 0; n < 120; n++) {
      await frame();
      const shown = panel
        ? panel.checkVisibility()
        : target.getAttribute('aria-selected') === 'true';
      if (shown && target.getAttribute('aria-selected') === 'true') break;
    }
    await frame();
    return performance.now() - t0;
  }, index);
}

/** Digita a busca de uma vez e mede até a lista mostrar só o host procurado. */
async function searchTime(page: Page, query: string): Promise<number> {
  return page.evaluate(async (q) => {
    const frame = () => new Promise<number>((r) => requestAnimationFrame(r));
    const box = document.querySelector<HTMLInputElement>('input[aria-label="Buscar hosts"]');
    if (!box) throw new Error('caixa de busca não encontrada');
    // Setter nativo: o React só vê o evento se o valor mudar por baixo dele.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    const t0 = performance.now();
    descriptor?.set?.call(box, q);
    box.dispatchEvent(new Event('input', { bubbles: true }));
    for (let n = 0; n < 120; n++) {
      await frame();
      // Filtrado de verdade: a lista inteira tem só o host procurado.
      const items = [...document.querySelectorAll('[role=treeitem], [role=option]')];
      if (items.length === 1 && items[0]?.textContent.includes(q)) break;
    }
    return performance.now() - t0;
  }, query);
}

test('20 abas com saída contínua: troca de aba abaixo de 100 ms', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    for (let i = 0; i < TABS; i++) await page.keyboard.press('Control+Shift+T');
    await expect(page.getByRole('tab')).toHaveCount(TABS);

    // Uma aba despejando texto sem parar enquanto as outras são trocadas.
    await page.getByRole('tab').first().click();
    await page.locator('[role=tabpanel][data-session-id]').first().locator('.xterm').click();
    await page.keyboard.type('while ($true) { "y" }\r');
    await page.waitForTimeout(1_000);

    const times: number[] = [];
    for (let round = 0; round < 2; round++) {
      for (let i = 1; i < TABS; i++) times.push(await switchTime(page, i));
      times.push(await switchTime(page, 0));
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] ?? Infinity;
    console.log(`[perf] ${test.info().title}: ${times.map((t) => t.toFixed(1)).join(' ')}`);
    test.info().annotations.push({
      type: 'troca de aba (ms)',
      description: `mediana ${times[times.length >> 1]?.toFixed(1)}, p95 ${p95.toFixed(1)}`,
    });
    expect(p95).toBeLessThan(SWITCH_MS);
  } finally {
    await app.close();
  }
});

test('busca em 1.000 hosts abaixo de 200 ms', async () => {
  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await page.evaluate(async (count) => {
      const api = (
        window as unknown as {
          shellvault: { hosts: { create: (h: object) => Promise<{ ok: boolean }> } };
        }
      ).shellvault.hosts;
      for (let i = 0; i < count; i++) {
        const n = String(i).padStart(4, '0');
        const res = await api.create({
          label: `host-${n}`,
          address: `10.${String(i >> 8)}.${String(i & 255)}.1`,
          port: 22,
          username: `user${n}`,
          authMethod: 'ask',
          credentialId: null,
          groupId: null,
          legacyAlgorithms: false,
        });
        if (!res.ok) throw new Error(`falha ao criar host ${n}`);
      }
    }, HOSTS);
    // Bloquear e desbloquear recarrega a lista com os hosts criados pela ponte.
    await page.getByRole('button', { name: 'Bloquear cofre' }).click();
    await expect(unlockForm(page)).toBeVisible();
    await unlock(page);
    // A lista é virtualizada: confirma a carga pela busca, depois limpa.
    const search = page.getByLabel('Buscar hosts');
    await search.fill('host-0999');
    await expect(hostItem(page, 'host-0999')).toBeVisible({ timeout: 30_000 });
    await search.fill('');

    const times: number[] = [];
    for (const n of ['0777', '0042', '0500', '0999', '0001']) {
      times.push(await searchTime(page, `host-${n}`));
      await expect(hostItem(page, `host-${n}`)).toBeVisible();
    }
    times.sort((a, b) => a - b);
    const worst = times[times.length - 1] ?? Infinity;
    console.log(`[perf] ${test.info().title}: ${times.map((t) => t.toFixed(1)).join(' ')}`);
    test.info().annotations.push({
      type: 'busca (ms)',
      description: times.map((t) => t.toFixed(1)).join(', '),
    });
    expect(worst).toBeLessThan(SEARCH_MS);
  } finally {
    await app.close();
  }
});

test('prévia de importação com 1.000 hosts em até 3 s e gravação em até 5 s', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'openhost-perf-'));
  const sheet = join(dir, 'mil.csv');
  const lines = ['nome;endereco;porta;usuario;grupo'];
  for (let i = 0; i < HOSTS; i++) {
    const n = String(i).padStart(4, '0');
    lines.push(
      `host-${n};10.${String(i >> 8)}.${String(i & 255)}.1;22;admin;Clientes/Regiao-${String(i % 40)}`,
    );
  }
  writeFileSync(sheet, lines.join('\r\n'));

  const app = await launchApp();
  const { page } = app;
  try {
    await createVault(page);
    await page.getByRole('button', { name: 'Importar e exportar' }).click();
    await testService(page, 'SetDialogPath', sheet);
    const table = page.getByRole('table');

    // Do clique até a última linha existir na tabela: leitura, prévia na ponte e renderização.
    let t0 = Date.now();
    await page
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: 'Planilha (CSV)' }) })
      .getByRole('button', { name: 'Escolher arquivo…' })
      .click();
    await expect(table.getByRole('textbox', { name: 'Endereço: host-0999' })).toBeAttached({
      timeout: 30_000,
    });
    const preview = Date.now() - t0;
    await expect(table.getByRole('row')).toHaveCount(HOSTS + 1);

    // Editar a última linha continua respondendo com 1.000 linhas na tela.
    const last = table.getByRole('textbox', { name: 'Usuário: host-0999' });
    await last.scrollIntoViewIfNeeded();
    t0 = Date.now();
    await last.fill('netops');
    await expect(last).toHaveValue('netops');
    const edit = Date.now() - t0;

    t0 = Date.now();
    await page.getByRole('button', { name: `Importar ${String(HOSTS)} hosts` }).click();
    await expect(page.getByText(`${String(HOSTS)} hosts criados`)).toBeVisible({ timeout: 30_000 });
    const commit = Date.now() - t0;

    console.log(
      `[perf] ${test.info().title}: prévia ${String(preview)} ms, edição ${String(edit)} ms, gravação ${String(commit)} ms`,
    );
    test.info().annotations.push({
      type: 'importação de 1.000 hosts (ms)',
      description: `prévia ${String(preview)}, edição ${String(edit)}, gravação ${String(commit)}`,
    });
    expect(preview).toBeLessThan(PREVIEW_MS);
    expect(commit).toBeLessThan(COMMIT_MS);
  } finally {
    await app.close();
  }
});

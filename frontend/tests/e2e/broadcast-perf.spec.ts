// Medições da 012 (validation.md): SC-1202 (atraso da tecla nos outros painéis) e SC-1205 (busca na
// paleta com 500 comandos). Grava os números em test-results/012-medicoes.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { createVault, terminalText } from './helpers/ui';

test.setTimeout(240_000);

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

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  return {
    n: values.length,
    mediana: Math.round(at(0.5) * 10) / 10,
    p95: Math.round(at(0.95) * 10) / 10,
    max: Math.round((sorted.at(-1) ?? 0) * 10) / 10,
  };
}

/** Marca quando `token` aparece em cada painel, num laço de ~1 ms dentro da página. */
async function watch(page: Page, ids: string[], token: string) {
  await page.evaluate(
    ({ ids, token }) => {
      const w = window as unknown as { __seen: Record<string, number> };
      w.__seen = {};
      const probe = (window as unknown as { __shellvaultProbe: { text: (id: string) => string } })
        .__shellvaultProbe;
      const channel = new MessageChannel();
      const started = performance.now();
      channel.port1.onmessage = () => {
        for (const id of ids)
          if (w.__seen[id] === undefined && probe.text(id).includes(token))
            w.__seen[id] = performance.now();
        if (Object.keys(w.__seen).length < ids.length && performance.now() - started < 5000)
          setTimeout(() => {
            channel.port2.postMessage(0);
          }, 1);
      };
      channel.port2.postMessage(0);
    },
    { ids, token },
  );
}

test('medições SC-1202 e SC-1205', async () => {
  const app = await launchApp();
  const { page } = app;
  const result: Record<string, unknown> = {};
  try {
    await createVault(page);

    // SC-1202: grupo de 2 painéis, modo ligado; atraso do receptor em relação ao ativo.
    const a = await openCmd(page);
    const b = await openCmd(page);
    await page.getByRole('tab').nth(1).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Agrupar com Prompt de Comando' }).first().click();
    await expect(page.locator('[data-pane]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Digitar no grupo', exact: true }).click();
    await page.locator(`[data-session-id="${b}"] .xterm`).click();
    const delays: number[] = [];
    for (let i = 0; i < 30; i++) {
      const token = `q${String(i).padStart(3, '0')}z`;
      await watch(page, [a, b], token);
      await page.keyboard.type(token);
      await expect
        .poll(() =>
          page.evaluate(() => Object.keys((window as unknown as { __seen: object }).__seen).length),
        )
        .toBe(2);
      const seen = await page.evaluate(
        () => (window as unknown as { __seen: Record<string, number> }).__seen,
      );
      delays.push((seen[a] ?? 0) - (seen[b] ?? 0));
      await page.keyboard.press('Escape');
    }
    result['SC-1202 atraso do receptor (ms)'] = stats(delays);

    // SC-1205: 500 comandos; tempo entre a tecla e a lista da paleta atualizada.
    await page.evaluate(async () => {
      const api = (
        window as unknown as {
          shellvault: { snippets: { create: (i: object) => Promise<{ ok: boolean }> } };
        }
      ).shellvault.snippets;
      for (let i = 0; i < 500; i++) {
        const res = await api.create({
          name: `cmd ${String(i).padStart(3, '0')} display interface`,
          text: `display interface gpon 0/${String(i)}`,
          tags: i % 2 ? ['huawei'] : ['olt'],
          execute: false,
        });
        if (!res.ok) throw new Error('create falhou');
      }
    });
    await page.keyboard.press('Control+Shift+P');
    const palette = page.getByRole('dialog', { name: 'Paleta de comandos' });
    await expect(palette).toBeVisible();
    const perKey: number[] = [];
    // keydown no campo → última mudança no diálogo da paleta (render da lista filtrada).
    await page.evaluate(() => {
      const w = window as unknown as { __k: number; __m: number };
      const dialog = document.querySelector('[role="dialog"]');
      if (!(document.activeElement instanceof HTMLInputElement) || !dialog)
        throw new Error('paleta sem campo');
      document.activeElement.addEventListener(
        'keydown',
        () => {
          w.__k = performance.now();
        },
        true,
      );
      new MutationObserver(() => {
        w.__m = performance.now();
      }).observe(dialog, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    const query = 'cmd 499';
    for (const char of query) {
      await page.keyboard.press(char === ' ' ? 'Space' : char);
      await page.waitForTimeout(250);
      perKey.push(
        await page.evaluate(() => {
          const w = window as unknown as { __k: number; __m: number };
          return Math.max(0, w.__m - w.__k);
        }),
      );
    }
    await expect(palette.getByRole('option').first()).toContainText('cmd 499');
    result['SC-1205 tecla até a lista (ms, 500 comandos)'] = stats(perKey);
  } finally {
    await app.close();
    mkdirSync('test-results', { recursive: true });
    writeFileSync(join('test-results', '012-medicoes.json'), JSON.stringify(result, null, 2));
  }
  console.log(JSON.stringify(result, null, 2));
});

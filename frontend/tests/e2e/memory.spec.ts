// Memória do app (specs/014, FR-1409): repete os cenários da linha de base, grava
// test-results/memory.md e falha acima das metas. Só terminais locais, sem dados do cofre (FR-1410).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { createVault } from './helpers/ui';

/** Memória privada (MB) por tipo de processo na árvore do app; WebView2 separado por `--type`. */
type Usage = Record<string, number>;

/** Duração da fase de saída contínua (padrão 5 min; menor só para investigar). */
const OUTPUT_MS = Number(process.env.MEM_OUTPUT_MS ?? 300_000);

const SHELLS = new Set(['powershell.exe', 'pwsh.exe', 'cmd.exe', 'conhost.exe', 'bash.exe', 'wsl.exe']);

function treeUsage(pid: number): Usage {
  const script = `
$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,@{n='Kind';e={ if ($_.CommandLine -match '--type=([a-z-]+)') { $matches[1] } else { $_.Name } }},PrivatePageCount
$ids = New-Object System.Collections.Generic.HashSet[int]
[void]$ids.Add(${String(pid)})
do { $n = $ids.Count; foreach ($p in $all) { if ($ids.Contains([int]$p.ParentProcessId)) { [void]$ids.Add([int]$p.ProcessId) } } } while ($ids.Count -ne $n)
$all | Where-Object { $ids.Contains([int]$_.ProcessId) } | Group-Object Kind | ForEach-Object { $_.Name + '=' + (($_.Group | Measure-Object PrivatePageCount -Sum).Sum / 1MB).ToString([cultureinfo]::InvariantCulture) }
`;
  const out = execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  const usage: Usage = {};
  for (const line of out.trim().split(/\r?\n/)) {
    const [kind, mb] = line.split('=');
    if (kind && mb) usage[kind] = Number(mb);
  }
  return usage;
}

/** Total do app, sem os shells do usuário. */
const appTotal = (u: Usage) =>
  Object.entries(u)
    .filter(([k]) => !SHELLS.has(k))
    .reduce((n, [, v]) => n + v, 0);
/** Só a tela embutida (GPU, renderer, utilitários, navegador). */
const webviewTotal = (u: Usage) =>
  Object.entries(u)
    .filter(([k]) => !SHELLS.has(k) && !k.startsWith('shellvault'))
    .reduce((n, [, v]) => n + v, 0);

async function jsHeap(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.detach();
  return page.evaluate(() => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? m.usedJSHeapSize / 1048576 : NaN;
  });
}

async function openTabs(page: Page, count: number) {
  const start = await page.getByRole('tab').count();
  for (let i = 0; i < count; i++) await page.keyboard.press('Control+Shift+T');
  await expect(page.getByRole('tab')).toHaveCount(start + count);
}

async function closeAllTabs(page: Page) {
  while ((await page.getByRole('tab').count()) > 0) {
    await page.keyboard.press('Control+Shift+W');
    const confirm = page.getByRole('dialog').getByRole('button', { name: /Fechar/ });
    if (await confirm.isVisible().catch(() => false)) await confirm.last().click();
  }
}

test('memória: repouso, por aba, depois de fechar e com saída contínua (014)', async () => {
  test.setTimeout(900_000);
  const app = await launchApp();
  const { page } = app;
  const pid = app.process.pid ?? 0;
  const rows: string[] = [];
  const measure = async (label: string, settleMs = 3_000) => {
    await page.waitForTimeout(settleMs);
    const heap = await jsHeap(page);
    const usage = treeUsage(pid);
    const fmt = (n: number) => n.toFixed(0);
    rows.push(
      `| ${label} | ${fmt(appTotal(usage))} | ${fmt(webviewTotal(usage))} | ${fmt(usage['gpu-process'] ?? 0)} | ${fmt(usage.renderer ?? 0)} | ${fmt(heap)} |`,
    );
    return { usage, heap, total: appTotal(usage), webview: webviewTotal(usage) };
  };
  try {
    await createVault(page);
    const idle = await measure('Cofre aberto, sem abas', 10_000);

    await openTabs(page, 20);
    const twenty = await measure('20 terminais ociosos');
    const perTab = (twenty.webview - idle.webview) / 20;

    await closeAllTabs(page);
    const closed1 = await measure('Fechou as 20 (ciclo 1)', 30_000);
    for (let cycle = 2; cycle <= 3; cycle++) {
      await openTabs(page, 20);
      await closeAllTabs(page);
    }
    const closed3 = await measure('Fechou as 20 (ciclo 3)', 30_000);

    // Saída contínua numa aba: heap estável depois que o histórico enche.
    await openTabs(page, 1);
    await page.locator('[role=tabpanel][data-session-id]').first().locator('.xterm').click();
    await page.keyboard.type('while ($true) { "linha de saida continua com algum texto para encher" }\r');
    await page.waitForTimeout(OUTPUT_MS * 0.4);
    const out2 = await measure('Saída contínua, minuto 2', 0);
    await page.waitForTimeout(OUTPUT_MS * 0.6);
    const out5 = await measure('Saída contínua, minuto 5', 0);
    await page.keyboard.press('Control+C');
    await closeAllTabs(page);

    const report = [
      '# Memória (014)',
      '',
      `Custo por aba na tela embutida: ${perTab.toFixed(1)} MB`,
      '',
      '| Cenário | App total (MB) | Tela embutida (MB) | GPU (MB) | Renderer (MB) | Heap JS (MB) |',
      '|---|---|---|---|---|---|',
      ...rows,
    ].join('\n');
    mkdirSync('test-results', { recursive: true });
    writeFileSync(join('test-results', 'memory.md'), report);
    console.log(report);

    // SC-1402: ≤ 15 MB por aba ociosa.
    expect.soft(perTab, 'custo por aba').toBeLessThanOrEqual(15);
    // SC-1403: fechar volta a +30 MB do repouso; 3 ciclos não somam +15 MB.
    expect.soft(closed1.total - idle.total, 'sobra depois de fechar').toBeLessThanOrEqual(30);
    expect.soft(closed3.total - closed1.total, 'crescimento em 3 ciclos').toBeLessThanOrEqual(15);
    // SC-1404: heap da interface estável com saída contínua.
    expect.soft(Math.abs(out5.heap - out2.heap), 'variação do heap 2→5 min').toBeLessThanOrEqual(10);
    // SC-1401: repouso ≤ 300 MB (depende da devolução de memória do Argon2, T008).
    expect.soft(idle.total, 'repouso').toBeLessThanOrEqual(300);
  } finally {
    await app.close();
  }
});

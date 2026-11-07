// Animações não atrasam a abertura (specs/015, SC-1501): tempo até a tela de senha montar com
// foco, 10 aberturas com Completas e 10 com Desligadas, no mesmo cofre.
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { createVault, unlock, unlockForm } from './helpers/ui';

const RUNS = 10;
const LIMIT_MS = 20;

async function firstScreenMs(page: Page): Promise<number> {
  await expect(unlockForm(page).getByLabel('Senha mestra', { exact: true })).toBeFocused();
  return page.evaluate(() => {
    const mark = performance.getEntriesByName('openhost:first-screen')[0];
    if (!mark) throw new Error('marca da primeira tela ausente');
    return mark.startTime;
  });
}

async function choose(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const region = page.getByRole('region', { name: 'Configurações' });
  await region.getByRole('button', { name: 'Aparência', exact: true }).click();
  await region.getByRole('radio', { name: label, exact: true }).click();
}

async function series(dataDir: string): Promise<number[]> {
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const app = await launchApp({ dataDir, motion: true });
    try {
      times.push(await firstScreenMs(app.page));
    } finally {
      await app.close();
    }
  }
  return times;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('abrir com animações não custa mais que 20 ms (SC-1501)', async () => {
  test.setTimeout(10 * 60_000);
  let app = await launchApp({ motion: true });
  const { dataDir } = app;
  const setMotion = async (label: string) => {
    app = await launchApp({ dataDir, motion: true });
    try {
      await unlock(app.page);
      await choose(app.page, label);
    } finally {
      await app.close();
    }
  };
  try {
    await createVault(app.page);
  } finally {
    await app.close();
  }
  await setMotion('Desligadas');
  const off = await series(dataDir);
  await setMotion('Completas');
  const full = await series(dataDir);
  const report = {
    off: off.map(Math.round),
    full: full.map(Math.round),
    meanOff: Math.round(mean(off)),
    meanFull: Math.round(mean(full)),
  };
  console.log(`SC-1501 ${JSON.stringify(report)}`);
  expect(mean(full) - mean(off)).toBeLessThanOrEqual(LIMIT_MS);
});

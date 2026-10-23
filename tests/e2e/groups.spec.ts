// US3 — grupos, mover, buscar e duplicar (T071).
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers/launch';
import { addHost, createVault, groupItem, hostItem, unlock } from './helpers/ui';

async function nameGroup(page: Page, title: string, name: string) {
  const dialog = page.getByRole('dialog', { name: title });
  await dialog.getByLabel('Nome do grupo').fill(name);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

async function menu(page: Page, row: ReturnType<typeof hostItem>, item: string) {
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: item }).click();
}

test('organizar hosts em grupos, buscar e duplicar', async () => {
  const { app, page } = await launchApp();
  try {
    await createVault(page);
    const ask = { port: 22, username: 'deploy', method: 'Perguntar ao conectar' } as const;
    await addHost(page, { ...ask, label: 'acme-web', address: '10.1.2.3' });
    await addHost(page, { ...ask, label: 'db-01', address: '10.9.8.7' });

    // Grupo e subgrupo.
    await page.getByRole('button', { name: 'Novo grupo' }).click();
    await nameGroup(page, 'Novo grupo', 'Clientes');
    await menu(page, groupItem(page, 'Clientes'), 'Novo subgrupo');
    await nameGroup(page, 'Novo subgrupo', 'ACME');
    await expect(groupItem(page, 'ACME')).toHaveAttribute('aria-level', '2');

    // Mover por arrastar e por menu.
    await hostItem(page, 'acme-web').dragTo(groupItem(page, 'ACME'));
    await expect(hostItem(page, 'acme-web')).toHaveAttribute('aria-level', '3');
    await menu(page, hostItem(page, 'db-01'), 'Mover para…');
    const move = page.getByRole('dialog', { name: 'Mover para grupo' });
    await move.getByLabel('Destino').selectOption({ label: 'Clientes' });
    await move.getByRole('button', { name: 'Confirmar' }).click();
    await expect(hostItem(page, 'db-01')).toHaveAttribute('aria-level', '2');

    // Recolher esconde os descendentes.
    await groupItem(page, 'Clientes').click();
    await expect(hostItem(page, 'db-01')).toBeHidden();
    await groupItem(page, 'Clientes').click();
    await expect(hostItem(page, 'db-01')).toBeVisible();

    // Busca filtra enquanto digita, com o caminho do grupo.
    const search = page.getByRole('searchbox', { name: 'Buscar hosts' });
    await search.pressSequentially('ACME');
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(hostItem(page, 'acme-web')).toContainText('Clientes / ACME');
    await search.fill('');
    await search.pressSequentially('10.9.8');
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(hostItem(page, 'db-01')).toBeVisible();
    await search.fill('nada-casa');
    await expect(page.getByText('Nenhum host encontrado.')).toBeVisible();
    await search.press('Escape');
    await expect(page.getByRole('tree')).toBeVisible();

    // Duplicar.
    await menu(page, hostItem(page, 'db-01'), 'Duplicar');
    await expect(hostItem(page, 'db-01 (cópia)')).toHaveAttribute('aria-level', '2');

    // Excluir grupo com confirmação: hosts e subgrupos sobem para a raiz.
    await menu(page, groupItem(page, 'Clientes'), 'Excluir');
    const confirm = page.getByRole('dialog', { name: 'Excluir grupo' });
    await expect(confirm).toContainText('nenhum host é excluído');
    await confirm.getByRole('button', { name: 'Excluir' }).click();
    await expect(groupItem(page, 'Clientes')).toHaveCount(0);
    await expect(groupItem(page, 'ACME')).toHaveAttribute('aria-level', '1');
    await expect(hostItem(page, 'db-01')).toHaveAttribute('aria-level', '1');
    await expect(hostItem(page, 'db-01 (cópia)')).toHaveAttribute('aria-level', '1');
    await expect(hostItem(page, 'acme-web')).toHaveAttribute('aria-level', '2');
  } finally {
    await app.close();
  }
});

test('1.000 hosts: lista virtualizada e busca imediata (SC-003)', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'shellvault-e2e-seed-'));
  execFileSync(process.execPath, ['scripts/seed-hosts.mjs', '1000'], {
    env: { ...process.env, SHELLVAULT_DATA_DIR: dataDir, SHELLVAULT_DEV_PASSWORD: 'senha-seed-1' },
    stdio: 'pipe',
  });
  const { app, page } = await launchApp({ dataDir });
  try {
    await unlock(page, 'senha-seed-1');
    await expect(groupItem(page, 'Produção')).toBeVisible();
    // Só a janela visível é renderizada.
    const rendered = await page.getByRole('treeitem').count();
    expect(rendered).toBeGreaterThan(10);
    expect(rendered).toBeLessThan(200);

    const search = page.getByRole('searchbox', { name: 'Buscar hosts' });
    await search.fill('srv-00999');
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(hostItem(page, 'srv-00999')).toBeVisible();
  } finally {
    await app.close();
  }
});

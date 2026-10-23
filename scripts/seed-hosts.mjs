// Popula um cofre de desenvolvimento com N hosts em grupos aninhados (SC-003).
// Uso: SHELLVAULT_DATA_DIR=<pasta> SHELLVAULT_DEV_PASSWORD=<senha> npm run seed:hosts -- 1000
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const TOP_GROUPS = ['Produção', 'Homologação', 'Clientes', 'Laboratório', 'Legado'];
const SUBGROUPS = ['Web', 'Banco', 'Filas', 'Monitoramento'];

function fatal(message) {
  console.error(message);
  process.exit(1);
}

const dataDir = process.env.SHELLVAULT_DATA_DIR;
const password = process.env.SHELLVAULT_DEV_PASSWORD;
const count = Number(process.argv[2] ?? 1000);
if (!dataDir) fatal('Defina SHELLVAULT_DATA_DIR com uma pasta de desenvolvimento.');
if (!password)
  fatal('Defina SHELLVAULT_DEV_PASSWORD com a senha mestra do cofre de desenvolvimento.');
if (!Number.isInteger(count) || count < 1 || count > 100_000)
  fatal('Quantidade inválida (1–100000).');

// Carrega o código TypeScript do principal com os mesmos aliases do build.
const vite = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: { alias: { '@shared': resolve(ROOT, 'src/shared') } },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { VaultStore } = await vite.ssrLoadModule('/src/main/vault/store.ts');
  const { createGroup } = await vite.ssrLoadModule('/src/main/domain/groups.ts');
  const { createHost } = await vite.ssrLoadModule('/src/main/domain/hosts.ts');

  mkdirSync(dataDir, { recursive: true });
  const store = await VaultStore.open(dataDir);
  if (store.status.state === 'nonexistent') await store.create(password, password);
  await store.unlock(password);

  const now = new Date().toISOString();
  await store.mutate((content) => {
    const leaves = [];
    for (const name of TOP_GROUPS) {
      const top = createGroup(content, name, null);
      for (const sub of SUBGROUPS) leaves.push(createGroup(content, sub, top.id).id);
      leaves.push(top.id);
    }
    for (let i = 0; i < count; i++) {
      createHost(
        content,
        {
          label: `srv-${String(i + 1).padStart(5, '0')}`,
          address: `10.${String((i >> 16) & 255)}.${String((i >> 8) & 255)}.${String(i & 255)}`,
          port: 22,
          username: i % 3 === 0 ? 'deploy' : i % 3 === 1 ? 'admin' : 'ops',
          authMethod: 'ask',
          credentialId: null,
          groupId: i % 10 === 0 ? null : (leaves[i % leaves.length] ?? null),
        },
        now,
      );
    }
  });
  store.lock();
  console.log(`${String(count)} hosts criados em ${dataDir}`);
} finally {
  await vite.close();
}

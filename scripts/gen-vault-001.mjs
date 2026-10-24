// Gera tests/fixtures/vault-001: cofre real da versão Electron (001) para testar a migração
// para a versão Wails (research R5). Usa o código da 001 e o custo mínimo de KDF (TEST_KDF).
// Uso: node scripts/gen-vault-001.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'tests', 'fixtures', 'vault-001');
const PASSWORD = 'senha-teste-1';
const NOW = '2026-10-23T12:00:00.000Z';

const vite = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: { alias: { '@shared': resolve(ROOT, 'frontend/src/shared') } },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const load = (p) => vite.ssrLoadModule(p);
  const { VaultStore } = await load('/src/main/vault/store.ts');
  const { TEST_KDF, ready, deriveKek } = await load('/src/main/vault/crypto.ts');
  const { createGroup } = await load('/src/main/domain/groups.ts');
  const { createHost } = await load('/src/main/domain/hosts.ts');
  const { createPassword, importKey, generateEd25519 } = await load(
    '/src/main/domain/credentials.ts',
  );
  const { acceptHostKey } = await load('/src/main/domain/knownHosts.ts');
  const { createRule } = await load('/src/main/domain/forwardRules.ts');

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const store = await VaultStore.open(OUT, { kdf: TEST_KDF });
  await store.create(PASSWORD, PASSWORD);
  await store.unlock(PASSWORD);

  const rsaPem = readFileSync(
    join(ROOT, 'tests', 'fixtures', 'keys', 'generated', 'rsa-pem'),
    'utf8',
  );
  let snapshot;
  await store.mutate((c) => {
    const noc = createGroup(c, 'NOC', null);
    const olts = createGroup(c, 'OLTs Datacom', noc.id);
    const pw = createPassword(c, 'Senha padrão NOC', 'pw-test-123', NOW);
    const ed = generateEd25519(c, 'Chave Ed25519 com passphrase', 'frase-secreta-9', NOW);
    const rsa = importKey(c, 'Chave RSA importada', rsaPem, null, NOW);
    const h1 = createHost(
      c,
      {
        label: 'OLT Centro',
        address: '10.10.0.1',
        port: 22,
        username: 'admin',
        authMethod: 'password',
        credentialId: pw.id,
        groupId: olts.id,
      },
      NOW,
    );
    createHost(
      c,
      {
        label: 'Servidor Linux',
        address: 'srv.exemplo.local',
        port: 2222,
        username: 'ops',
        authMethod: 'key',
        credentialId: ed.id,
        groupId: noc.id,
      },
      NOW,
    );
    createHost(
      c,
      {
        label: 'Mikrotik Borda',
        address: '2001:db8::1',
        port: 22,
        username: 'noc',
        authMethod: 'ask',
        credentialId: null,
        groupId: null,
      },
      NOW,
    );
    void rsa;
    acceptHostKey(
      c,
      '10.10.0.1:22',
      'ssh-ed25519',
      'SHA256:AAAAexemploDeFingerprintDaOltCentro000000000',
      NOW,
    );
    acceptHostKey(
      c,
      '[srv.exemplo.local]:2222',
      'ssh-rsa',
      'SHA256:BBBBexemploDeFingerprintDoServidorLinux0000',
      NOW,
    );
    createRule(c, {
      hostId: h1.id,
      label: 'Web da OLT',
      bindAddress: '127.0.0.1',
      allowNonLoopback: false,
      bindPort: 8080,
      destHost: '127.0.0.1',
      destPort: 80,
    });
    createRule(c, {
      hostId: h1.id,
      label: null,
      bindAddress: '0.0.0.0',
      allowNonLoopback: true,
      bindPort: 2323,
      destHost: '192.168.1.1',
      destPort: 23,
    });
    c.settings.autoLockMinutes = 30;
    c.settings.connectTimeoutSeconds = 20;
    snapshot = structuredClone(c);
  });
  store.lock();

  // Preferências da 001 (settings.json), migradas para preferences + perfil global.
  writeFileSync(
    join(OUT, 'settings.json'),
    JSON.stringify(
      {
        theme: 'dark',
        terminalFontFamily: 'Consolas, monospace',
        terminalFontSize: 15,
        window: { width: 1300, height: 820, x: 40, y: 30, maximized: false },
      },
      null,
      2,
    ),
  );

  // Vetor da KDF: o Go deve derivar a mesma KEK que o libsodium com os mesmos parâmetros.
  await ready();
  const salt = new Uint8Array(16).map((_, i) => i);
  const kek = deriveKek(PASSWORD, { salt, ...TEST_KDF });

  writeFileSync(
    join(OUT, 'expected.json'),
    JSON.stringify(
      {
        password: PASSWORD,
        content: snapshot,
        kdfVector: {
          password: PASSWORD,
          saltHex: Buffer.from(salt).toString('hex'),
          opsLimit: TEST_KDF.opsLimit,
          memLimit: TEST_KDF.memLimit,
          kekHex: Buffer.from(kek).toString('hex'),
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Cofre 001 de teste gerado em ${OUT}`);
} finally {
  await vite.close();
}

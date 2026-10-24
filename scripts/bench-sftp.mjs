// Compara a taxa de transferência do ShellVault com o sftp.exe do Windows (SC-006).
// Uso: npm run bench:sftp [-- <MB>]  (padrão 1024 MB; exige o contêiner de teste no ar)
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import { KEYS_DIR, generateTestKeys } from './gen-test-keys.mjs';
import { SSHD, up } from './sshd.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MB = 1024 * 1024;
const MIN_RATIO = 0.8;
const SFTP_EXE = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'OpenSSH', 'sftp.exe');

const sizeMb = Number(process.argv[2] ?? 1024);
if (!Number.isInteger(sizeMb) || sizeMb < 1) {
  console.error('Tamanho inválido em MB.');
  process.exit(2);
}

async function randomFile(path, size) {
  const fh = await open(path, 'w');
  for (let done = 0; done < size; done += 8 * MB) {
    await fh.write(randomBytes(Math.min(8 * MB, size - done)));
  }
  await fh.close();
}

function sha256(path) {
  return new Promise((ok, fail) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => hash.update(d))
      .on('end', () => ok(hash.digest('hex')))
      .on('error', fail);
  });
}

async function timed(fn) {
  const start = performance.now();
  await fn();
  return (performance.now() - start) / 1000;
}

/** Chave sem passphrase copiada com ACL restrita (o OpenSSH do Windows recusa chave aberta). */
function privateKeyForSftpExe(dir) {
  const key = join(dir, 'id_ed25519');
  copyFileSync(join(KEYS_DIR, 'ed25519'), key);
  execFileSync('icacls', [key, '/inheritance:r', '/grant:r', `${userInfo().username}:R`], {
    stdio: 'ignore',
  });
  return key;
}

function sftpExe(key, batch) {
  execFileSync(
    SFTP_EXE,
    [
      '-q',
      '-i',
      key,
      '-P',
      String(SSHD.port),
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=NUL',
      '-b',
      batch,
      `keyuser@${SSHD.host}`,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
}

await up();
generateTestKeys();
const work = mkdtempSync(join(tmpdir(), 'shellvault-bench-'));
const vite = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, ws: false },
  resolve: { alias: { '@shared': resolve(ROOT, 'frontend/src/shared') } },
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  const { openConnection } = await vite.ssrLoadModule('/src/main/ssh/connection.ts');
  const { TransferManager } = await vite.ssrLoadModule('/src/main/sftp/transfers.ts');

  const src = join(work, 'bench.bin');
  console.log(`Gerando ${String(sizeMb)} MB aleatórios…`);
  await randomFile(src, sizeMb * MB);
  const expected = await sha256(src);

  // sftp.exe
  const key = privateKeyForSftpExe(work);
  const exeDown = join(work, 'exe-down.bin');
  const putBatch = join(work, 'put.txt');
  const getBatch = join(work, 'get.txt');
  writeFileSync(putBatch, `put "${src}" bench-exe.bin\n`);
  writeFileSync(getBatch, `get bench-exe.bin "${exeDown}"\nrm bench-exe.bin\n`);
  const exeUp = await timed(() => sftpExe(key, putBatch));
  const exeGet = await timed(() => sftpExe(key, getBatch));
  if ((await sha256(exeDown)) !== expected) throw new Error('sftp.exe: hash diferente');

  // ShellVault (mesmo código da fila de transferências do app)
  const client = await openConnection({
    target: { address: SSHD.host, port: SSHD.port, username: 'keyuser' },
    auth: {
      kind: 'key',
      privateKey: readFileSync(join(KEYS_DIR, 'ed25519'), 'utf8'),
      passphrase: null,
    },
    timeoutSeconds: 15,
    knownHosts: { check: () => ({ kind: 'match' }), accept: () => Promise.resolve() },
    callbacks: {
      onState: () => undefined,
      onHostKey: () => Promise.resolve(true),
      onPrompt: () => Promise.resolve(null),
    },
  });
  const channel = () =>
    new Promise((ok, fail) => client.sftp((err, sftp) => (err ? fail(err) : ok(sftp))));
  const browse = await channel();
  const home = await new Promise((ok, fail) =>
    browse.realpath('.', (err, p) => (err ? fail(err) : ok(p))),
  );
  const endpoint = { sessionId: 'bench', browse, channel };

  const states = new Map();
  const manager = new TransferManager({
    transfer: (t) => states.set(t.id, t),
    conflict: (c) => manager.resolveConflict(c.transferId, 'replace'),
  });
  const finished = (id) =>
    new Promise((ok, fail) => {
      const tick = () => {
        const t = states.get(id);
        if (t?.state === 'completed') ok(t);
        else if (t && ['failed', 'cancelled', 'skipped'].includes(t.state))
          fail(new Error(`transferência ${t.state}: ${t.reason ?? ''}`));
        else setTimeout(tick, 20);
      };
      tick();
    });

  const svDir = join(work, 'sv');
  mkdirSync(svDir);
  const svUp = await timed(async () => {
    const [id] = manager.upload(endpoint, [src], home);
    await finished(id);
  });
  const svGet = await timed(async () => {
    const [id] = await manager.download(endpoint, [`${home}/bench.bin`], svDir);
    await finished(id);
  });
  if ((await sha256(join(svDir, 'bench.bin'))) !== expected)
    throw new Error('ShellVault: hash diferente');
  await new Promise((ok) => browse.unlink(`${home}/bench.bin`, () => ok()));
  client.end();

  const rate = (s) => (sizeMb / s).toFixed(1);
  const rows = [
    ['Envio', exeUp, svUp],
    ['Download', exeGet, svGet],
  ];
  let failed = false;
  console.log(`\n${String(sizeMb)} MB — MB/s (sftp.exe | ShellVault | razão)`);
  for (const [label, exe, sv] of rows) {
    const ratio = exe / sv;
    failed ||= ratio < MIN_RATIO;
    console.log(
      `${label.padEnd(9)} ${rate(exe).padStart(8)} | ${rate(sv).padStart(8)} | ${(ratio * 100).toFixed(0)}%`,
    );
  }
  if (failed) {
    console.error(
      `\nFALHOU: ShellVault abaixo de ${String(MIN_RATIO * 100)}% do sftp.exe (SC-006).`,
    );
    process.exitCode = 1;
  } else {
    console.log('\nOK: SC-006 atendido.');
  }
} finally {
  await vite.close();
  rmSync(work, { recursive: true, force: true });
}

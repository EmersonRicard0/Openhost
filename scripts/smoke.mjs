// Teste de abertura (specs/004-linux-macos, R11, FR-422): abre o build `-tags smoke` com um
// diretório de dados vazio. O frontend cria cofre, host com senha e chave com passphrase e chama
// `Smoke.Ready()`, que encerra com código 0. Depois varre o que ficou em disco atrás dos segredos
// (FR-404, SC-405).
//
// Uso: node scripts/smoke.mjs [binário]
//   Sem binário, compila com `wails build -tags smoke` (no Linux também `webkit2_41`).
//   No Linux, rodar sob `xvfb-run` quando não houver sessão gráfica.
import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { filesUnder, scan } from './lib/secrets-scan.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const TIMEOUT_MS = 60_000;
const OS = platform();
const SECRETS_FILE = join(ROOT, 'frontend', 'src', 'app', 'smoke-secrets.json');

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(1);
}

function build() {
  const tags = OS === 'linux' ? 'smoke webkit2_41' : 'smoke';
  execFileSync(
    'wails',
    ['build', '-tags', tags, '-o', OS === 'win32' ? 'shellvault-smoke.exe' : 'shellvault-smoke'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, VITE_SMOKE: '1' },
    },
  );
  if (OS === 'win32') return join(ROOT, 'build', 'bin', 'shellvault-smoke.exe');
  // No macOS o Wails monta o .app com o nome do produto; `-o` vale para o executável dentro dele.
  if (OS === 'darwin') {
    // O nome do .app e do executável dentro dele variam com a versão do Wails: pega o que existir.
    const app = readdirSync(join(ROOT, 'build', 'bin')).find((name) => name.endsWith('.app'));
    if (!app) fail('nenhum .app em build/bin');
    const macos = join(ROOT, 'build', 'bin', app, 'Contents', 'MacOS');
    const [exe] = readdirSync(macos);
    if (!exe) fail(`nenhum executável em ${macos}`);
    return join(macos, exe);
  }
  return join(ROOT, 'build', 'bin', 'shellvault-smoke');
}

const bin = process.argv[2] ? resolve(process.argv[2]) : build();
if (!existsSync(bin)) fail(`binário não encontrado: ${bin}`);

const work = mkdtempSync(join(tmpdir(), 'openhost-smoke-'));
const dataDir = join(work, 'data');
mkdirSync(dataDir);
const env = { ...process.env, SHELLVAULT_DATA_DIR: dataDir };
// No Linux o WebKitGTK guarda o perfil sob os diretórios XDG: dentro do temporário, entram na
// varredura. No macOS o WKWebView usa ~/Library pelo identificador do app; varremos lá também.
const scanDirs = [work];
if (OS === 'linux') {
  for (const name of ['XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME']) {
    const dir = join(work, name.toLowerCase());
    mkdirSync(dir);
    env[name] = dir;
  }
}
if (OS === 'darwin') {
  for (const dir of [
    'Library/WebKit/app.openhost.desktop',
    'Library/Caches/app.openhost.desktop',
  ]) {
    scanDirs.push(join(homedir(), dir));
  }
}

const started = Date.now();
const child = spawn(bin, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (d) => (output += d));
child.stderr.on('data', (d) => (output += d));

const code = await new Promise((done) => {
  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    done('tempo');
  }, TIMEOUT_MS);
  child.on('exit', (c, signal) => {
    clearTimeout(timer);
    done(c ?? signal);
  });
  child.on('error', (err) => {
    clearTimeout(timer);
    done(err.message);
  });
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (code !== 0) {
  console.error(output.trim().split('\n').slice(-40).join('\n'));
  fail(
    code === 'tempo'
      ? `o app não chamou Smoke.Ready em ${TIMEOUT_MS / 1000} s`
      : `o app saiu com ${code}`,
  );
}

// O processo do WebView pode sobreviver alguns instantes ao app: espera o disco parar de mudar.
const listing = () => scanDirs.filter((d) => existsSync(d)).flatMap((d) => filesUnder(d));
const fingerprint = (fs) =>
  fs
    .map((f) => {
      try {
        return `${f}:${statSync(f).size}`;
      } catch {
        return '';
      }
    })
    .join('|');
let files = listing();
for (let i = 0, last = ''; i < 30; i++) {
  const now = fingerprint(files);
  if (now === last) break;
  last = now;
  await new Promise((r) => setTimeout(r, 500));
  files = listing();
}
if (!files.some((f) => /\.db$/.test(f))) fail(`nenhum cofre (.db) em ${dataDir}`);

const secrets = JSON.parse(readFileSync(SECRETS_FILE, 'utf8'));
const named = {
  'senha mestra': secrets.master,
  'senha do host': secrets.hostPassword,
  passphrase: secrets.passphrase,
};
const found = scan(files, work, named);
for (const [name, secret] of Object.entries(named)) {
  if (output.includes(secret)) found.push(`saída do processo: ${name}`);
}
if (found.length > 0) fail(`segredos legíveis encontrados:\n  ${found.join('\n  ')}`);

const dumps = files.filter((f) => /\.(dmp|core)$|(^|[\\/])core(\.\d+)?$/i.test(f));
if (dumps.length > 0) fail(`despejos de falha: ${dumps.map((f) => relative(work, f)).join(', ')}`);

const size = files.reduce((n, f) => n + (existsSync(f) ? statSync(f).size : 0), 0);
console.log(
  `smoke ok em ${seconds} s: ${files.length} arquivos (${(size / 1024).toFixed(0)} KiB) sem segredos legíveis.`,
);
rmSync(work, { recursive: true, force: true });

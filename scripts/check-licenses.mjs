// Verifica as licenças das dependências de produção (Princípio I).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Unlicense: domínio público, aprovada pela OSI (usada por tweetnacl, dependência do ssh2).
const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'Unlicense',
]);
const root = process.cwd();

function readPkg(dir) {
  return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type).join(' OR ');
  return 'UNKNOWN';
}

function isAllowed(expr) {
  // Aceita expressões SPDX simples com OR se alguma alternativa for permitida.
  return expr
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/)
    .some((alt) => alt.split(/\s+AND\s+/).every((l) => ALLOWED.has(l.trim())));
}

const seen = new Map();
function walk(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    try {
      const pkg = readPkg(candidate);
      const key = `${pkg.name}@${pkg.version}`;
      if (seen.has(key)) return;
      seen.set(key, licenseOf(pkg));
      for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
        walk(dep, candidate);
      }
      return;
    } catch {
      const parent = join(dir, '..');
      if (parent === dir || !dir.startsWith(root)) return;
      dir = parent;
    }
  }
}

for (const dep of Object.keys(readPkg(root).dependencies ?? {})) walk(dep, root);

const rows = [...seen].sort(([a], [b]) => a.localeCompare(b));
const bad = rows.filter(([, lic]) => !isAllowed(lic));
for (const [name, lic] of rows) console.log(`${isAllowed(lic) ? 'ok ' : 'BAD'} ${name} ${lic}`);
if (bad.length > 0) {
  console.error(`\n${bad.length} dependência(s) com licença não permitida.`);
  process.exit(1);
}
console.log(`\n${rows.length} dependências de produção verificadas.`);

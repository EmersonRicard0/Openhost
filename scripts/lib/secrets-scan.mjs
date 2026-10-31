// Varredura de segredos em disco (SC-108, SC-304, FR-404): procura cada segredo em UTF-8, UTF-16
// e base64. Usada pelo E2E do Windows (frontend/tests/e2e/secrets-scan.spec.ts) e pelo teste de
// abertura dos três sistemas (scripts/smoke.mjs).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Todos os arquivos sob `dir`, recursivamente. */
export function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

/** Trechos do corpo base64 da chave: início, meio e fim, longe dos cabeçalhos PEM. */
export function keyFragments(pem) {
  const body = pem
    .split('\n')
    .filter((line) => line && !line.startsWith('-----'))
    .join('');
  const at = [8, Math.floor(body.length / 2), body.length - 40];
  return at.map((i) => body.slice(i, i + 24));
}

function encodings(secret) {
  return [
    { label: 'utf8', bytes: Buffer.from(secret, 'utf8') },
    { label: 'utf16le', bytes: Buffer.from(secret, 'utf16le') },
    { label: 'base64', bytes: Buffer.from(Buffer.from(secret, 'utf8').toString('base64'), 'utf8') },
  ];
}

/** Ocorrências de cada segredo, em cada codificação, nos arquivos dados. */
export function scan(files, base, secrets) {
  const found = [];
  for (const file of files) {
    let data;
    try {
      data = readFileSync(file);
    } catch (err) {
      // Temporário que o WebView apagou entre listar e ler.
      if (err.code === 'ENOENT') continue;
      throw err;
    }
    for (const [name, secret] of Object.entries(secrets)) {
      for (const { label, bytes } of encodings(secret)) {
        if (data.includes(bytes)) found.push(`${relative(base, file)}: ${name} (${label})`);
      }
    }
  }
  return found;
}

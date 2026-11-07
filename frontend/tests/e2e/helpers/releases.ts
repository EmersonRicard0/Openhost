// Servidor de releases local para os e2e da atualização (specs/007): imita a lista de releases
// do GitHub e serve o pacote, o SHA256SUMS.txt e a assinatura Ed25519 do próprio servidor.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReleaseServer {
  /** URL da lista de releases (vai para SHELLVAULT_E2E_UPDATE_URL). */
  url: string;
  /** Chave pública Ed25519 em base64 (vai para SHELLVAULT_E2E_UPDATE_PUBKEY). */
  publicKey: string;
  /** Variáveis de ambiente para `launchApp`. */
  env: (installKind?: string) => Record<string, string>;
  /** Versão publicada; `null` publica nenhuma. */
  publish: (version: string | null, options?: { badSignature?: boolean }) => void;
  /** Requisições à lista de releases desde o início (ou desde `resetCount`). */
  listRequests: () => number;
  resetCount: () => void;
  close: () => Promise<void>;
}

/** Nome do pacote que o app procura para cada formato de instalação simulado. */
function packageName(version: string, installKind: string): string {
  if (installKind === 'deb') return `openhost_${version}_amd64.deb`;
  return `OpenHost-${version}-windows-amd64-installer.exe`;
}

export async function startReleaseServer(): Promise<ReleaseServer> {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const rawPublic = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  // Pacote grande o bastante para o progresso aparecer, servido em pedaços.
  const payload = randomBytes(4 * 1024 * 1024);
  let version: string | null = null;
  let badSignature = false;
  let requests = 0;

  const files = (): Map<string, Buffer> => {
    const out = new Map<string, Buffer>();
    if (!version) return out;
    const names = [packageName(version, 'nsis'), packageName(version, 'deb')];
    const digest = createHash('sha256').update(payload).digest('hex');
    const sums = Buffer.from(names.map((n) => `${digest}  ${n}\n`).join(''));
    const signed = badSignature ? Buffer.concat([sums, Buffer.from('x')]) : sums;
    for (const n of names) out.set(n, payload);
    out.set('SHA256SUMS.txt', sums);
    out.set('SHA256SUMS.txt.sig', Buffer.from(sign(null, signed, privateKey).toString('base64')));
    return out;
  };

  const server: Server = createServer((req, res) => {
    const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    const path = new URL(req.url ?? '/', base).pathname;
    if (path === '/releases') {
      requests++;
      const assets = [...files()].map(([name, body]) => ({
        name,
        size: body.length,
        browser_download_url: `${base}/assets/${name}`,
      }));
      const list = version
        ? [
            {
              tag_name: `v${version}`,
              prerelease: false,
              draft: false,
              body: '## Novidades\n\n- Teste',
              assets,
            },
          ]
        : [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(list));
      return;
    }
    const body = path.startsWith('/assets/')
      ? files().get(path.slice('/assets/'.length))
      : undefined;
    if (!body) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Length': String(body.length) });
    // Em pedaços com pausa, para o estado "baixando" ficar visível.
    let offset = 0;
    const step = (): void => {
      if (offset >= body.length) {
        res.end();
        return;
      }
      res.write(body.subarray(offset, offset + 256 * 1024));
      offset += 256 * 1024;
      setTimeout(step, 60);
    };
    step();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/releases`;
  const key = rawPublic.toString('base64');

  return {
    url,
    publicKey: key,
    env: (installKind = 'nsis') => ({
      SHELLVAULT_E2E_UPDATE_URL: url,
      SHELLVAULT_E2E_UPDATE_PUBKEY: key,
      SHELLVAULT_E2E_INSTALL_KIND: installKind,
    }),
    publish(next, options = {}) {
      version = next;
      badSignature = options.badSignature ?? false;
    },
    listRequests: () => requests,
    resetCount() {
      requests = 0;
    },
    close: () =>
      new Promise<void>((r) =>
        server.close(() => {
          r();
        }),
      ),
  };
}

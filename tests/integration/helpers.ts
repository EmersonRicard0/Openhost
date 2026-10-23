import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client, ClientChannel } from 'ssh2';
import { acceptHostKey, checkHostKey } from '../../src/main/domain/knownHosts';
import {
  openConnection,
  type ConnectCallbacks,
  type ResolvedAuth,
} from '../../src/main/ssh/connection';
import { emptyContent } from '../../src/main/vault/content';

export const SSHD = {
  address: process.env.SSHD_HOST ?? '127.0.0.1',
  port: Number(process.env.SSHD_PORT ?? 2222),
};

export const keysDir = () => process.env.SSHD_KEYS_DIR ?? '';
export const keyPassphrase = () => process.env.SSHD_KEY_PASSPHRASE ?? '';
export const readKey = (name: string) => readFileSync(join(keysDir(), name), 'utf8');

/** known_hosts em memória, aceitando chaves novas automaticamente. */
export function memoryKnownHosts() {
  const content = emptyContent();
  return {
    content,
    access: {
      check: (endpoint: string, keyType: string, fp: string) =>
        checkHostKey(content, endpoint, keyType, fp),
      accept: (endpoint: string, keyType: string, fp: string) => {
        acceptHostKey(content, endpoint, keyType, fp, new Date().toISOString());
        return Promise.resolve();
      },
    },
  };
}

export function autoCallbacks(overrides: Partial<ConnectCallbacks> = {}): ConnectCallbacks {
  return {
    onState: () => undefined,
    onHostKey: () => Promise.resolve(true),
    onPrompt: () => Promise.resolve(null),
    ...overrides,
  };
}

export function connect(
  username: string,
  auth: ResolvedAuth,
  options: {
    callbacks?: Partial<ConnectCallbacks>;
    known?: ReturnType<typeof memoryKnownHosts>;
    port?: number;
    address?: string;
    timeoutSeconds?: number;
  } = {},
): Promise<Client> {
  return openConnection({
    target: {
      address: options.address ?? SSHD.address,
      port: options.port ?? SSHD.port,
      username,
    },
    auth,
    timeoutSeconds: options.timeoutSeconds ?? 10,
    knownHosts: (options.known ?? memoryKnownHosts()).access,
    callbacks: autoCallbacks(options.callbacks),
  });
}

/** Roda um comando em um shell interativo e devolve a saída até o marcador. */
export function shellRun(
  client: Client,
  command: string,
  window = { cols: 80, rows: 24 },
): Promise<string> {
  return new Promise((resolve, reject) => {
    client.shell({ term: 'xterm-256color', ...window }, (err, stream: ClientChannel) => {
      if (err) {
        reject(err);
        return;
      }
      let out = '';
      const marker = `__FIM_${Date.now().toString(36)}__`;
      stream.on('data', (d: Buffer) => {
        out += d.toString('utf8');
        const end = out.lastIndexOf(`${marker}\r\n`);
        if (end >= 0) {
          stream.end('exit\n');
          resolve(out);
        }
      });
      stream.stderr.on('data', (d: Buffer) => {
        out += d.toString('utf8');
      });
      stream.write(`${command}; echo ${marker.slice(0, 4)}''${marker.slice(4)}\n`);
    });
  });
}

export async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

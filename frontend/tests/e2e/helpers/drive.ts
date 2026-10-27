// Google Drive falso para os e2e da sincronização (specs/008): o binário `drivefake`, compilado
// pelo global-setup, sobe a API falsa e uma porta de controle só em 127.0.0.1.
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { DRIVEFAKE_EXE } from './paths';

export interface DriveFile {
  name: string;
  /** Bytes do arquivo como o Drive guardou. */
  data: Buffer;
}

export interface FakeDrive {
  /** Variáveis de ambiente para `launchApp`. */
  env: Record<string, string>;
  files: () => Promise<DriveFile[]>;
  snapshots: () => Promise<DriveFile[]>;
  setOffline: (offline: boolean) => Promise<void>;
  failNext: (status: number, reason: string) => Promise<void>;
  close: () => Promise<void>;
}

export async function startFakeDrive(): Promise<FakeDrive> {
  const child: ChildProcess = spawn(DRIVEFAKE_EXE, [], { stdio: ['pipe', 'pipe', 'inherit'] });
  if (!child.stdout) throw new Error('drivefake sem saída padrão');
  const lines = createInterface({ input: child.stdout });
  const ready = await new Promise<{ api: string; control: string }>((resolve, reject) => {
    child.once('exit', (code) => {
      reject(new Error(`drivefake saiu com código ${String(code)}`));
    });
    lines.once('line', (line) => {
      resolve(JSON.parse(line) as { api: string; control: string });
    });
  });

  const post = async (path: string): Promise<void> => {
    const res = await fetch(`${ready.control}${path}`, { method: 'POST' });
    if (!res.ok) throw new Error(`drivefake ${path}: ${String(res.status)}`);
  };
  const files = async (): Promise<DriveFile[]> => {
    const res = await fetch(`${ready.control}/files`);
    const list = (await res.json()) as { name: string; data: string | null }[];
    return list.map((f) => ({ name: f.name, data: Buffer.from(f.data ?? '', 'base64') }));
  };

  return {
    env: { SHELLVAULT_E2E_CLOUD_URL: ready.api },
    files,
    snapshots: async () => (await files()).filter((f) => f.name.startsWith('snap-')),
    setOffline: (offline) => post(`/offline?on=${offline ? '1' : '0'}`),
    failNext: (status, reason) =>
      post(`/fail?status=${String(status)}&reason=${encodeURIComponent(reason)}`),
    close: async () => {
      lines.close();
      if (child.exitCode !== null) return;
      const exited = new Promise((r) => child.once('exit', r));
      child.stdin?.end();
      child.kill();
      await exited;
    },
  };
}

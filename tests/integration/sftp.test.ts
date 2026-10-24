import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client, SFTPWrapper } from 'ssh2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConflictEvent, Transfer } from '../../frontend/src/shared/model/types';
import { listDir, makeDir, realPath, removePath, renamePath } from '../../src/main/sftp/browser';
import { TransferManager, type SftpEndpoint } from '../../src/main/sftp/transfers';
import { connect } from './helpers';

const MB = 1024 * 1024;

function openSftp(client: Client): Promise<SFTPWrapper> {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => {
      if (err) reject(err);
      else resolve(sftp);
    });
  });
}

async function randomFile(dir: string, name: string, size: number): Promise<string> {
  const path = join(dir, name);
  const fh = await open(path, 'w');
  for (let done = 0; done < size; done += 4 * MB) {
    await fh.write(randomBytes(Math.min(4 * MB, size - done)));
  }
  await fh.close();
  return path;
}

function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => hash.update(d))
      .on('end', () => {
        resolve(hash.digest('hex'));
      })
      .on('error', reject);
  });
}

/** Gerenciador com eventos gravados e espera pelo estado final. */
function manager() {
  const transfers = new Map<string, Transfer>();
  const conflicts: ConflictEvent[] = [];
  const mgr = new TransferManager({
    transfer: (t) => transfers.set(t.id, t),
    conflict: (c) => conflicts.push(c),
  });
  const final = (id: string, timeoutMs = 90_000) =>
    new Promise<Transfer>((resolve, reject) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const t = transfers.get(id);
        if (t && ['completed', 'cancelled', 'failed', 'skipped'].includes(t.state)) resolve(t);
        else if (Date.now() > deadline) reject(new Error(`tempo esgotado: ${t?.state ?? '?'}`));
        else setTimeout(tick, 50);
      };
      tick();
    });
  const until = async (check: () => boolean, timeoutMs = 30_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!check()) {
      if (Date.now() > deadline) throw new Error('tempo esgotado');
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  return { mgr, transfers, conflicts, final, until };
}

describe('SFTP', () => {
  let client: Client;
  let sftp: SFTPWrapper;
  let endpoint: SftpEndpoint;
  let home: string;
  let work: string;
  let local: string;

  beforeAll(async () => {
    client = await connect('pwuser', { kind: 'password', password: 'pw-test-123' });
    sftp = await openSftp(client);
    endpoint = { sessionId: 'sftp-test', browse: sftp, channel: () => openSftp(client) };
    home = await realPath(sftp, '.');
    work = `${home}/it-${Date.now().toString(36)}`;
    await makeDir(sftp, work);
    local = mkdtempSync(join(tmpdir(), 'shellvault-sftp-'));
  });

  afterAll(async () => {
    await removePath(sftp, work, true).catch(() => undefined);
    client.end();
  });

  it('lista, cria pasta com acentos, renomeia e remove recursivamente', async () => {
    const dir = `${work}/teste ç ã`;
    await makeDir(sftp, dir);
    await makeDir(sftp, `${dir}/sub`);
    writeFileSync(join(local, 'a.txt'), 'olá');
    await new Promise<void>((resolve, reject) => {
      sftp.fastPut(join(local, 'a.txt'), `${dir}/sub/a.txt`, (e) => {
        if (e) reject(e);
        else resolve();
      });
    });

    const entries = await listDir(sftp, work);
    const entry = entries.find((e) => e.name === 'teste ç ã');
    expect(entry).toMatchObject({ type: 'dir', path: dir });
    expect(typeof entry?.size).toBe('number');
    expect(entry?.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const sub = await listDir(sftp, `${dir}/sub`);
    expect(sub).toEqual([expect.objectContaining({ name: 'a.txt', type: 'file', size: 4 })]);

    await renamePath(sftp, dir, `${work}/renomeada`);
    expect((await listDir(sftp, work)).map((e) => e.name)).toEqual(['renomeada']);

    await expect(removePath(sftp, `${work}/renomeada`, false)).rejects.toBeTruthy();
    await removePath(sftp, `${work}/renomeada`, true);
    expect(await listDir(sftp, work)).toEqual([]);
  });

  it('lista pastas primeiro e depois arquivos, por nome', async () => {
    const dir = `${work}/ordem`;
    await makeDir(sftp, dir);
    writeFileSync(join(local, 'z.txt'), 'z');
    const { mgr, final } = manager();
    const [id] = mgr.upload(endpoint, [join(local, 'z.txt')], dir);
    await final(id ?? '');
    await makeDir(sftp, `${dir}/b`);
    await makeDir(sftp, `${dir}/A`);
    expect((await listDir(sftp, dir)).map((e) => e.name)).toEqual(['A', 'b', 'z.txt']);
    await removePath(sftp, dir, true);
  });

  it('envia e baixa 100 MB com SHA-256 idêntico', { timeout: 180_000 }, async () => {
    const src = await randomFile(local, 'grande.bin', 100 * MB);
    const { mgr, transfers, final } = manager();

    const [up] = mgr.upload(endpoint, [src], work);
    const uploaded = await final(up ?? '');
    expect(uploaded).toMatchObject({
      state: 'completed',
      bytesTotal: 100 * MB,
      bytesDone: 100 * MB,
    });

    const destDir = mkdtempSync(join(tmpdir(), 'shellvault-dl-'));
    const [down] = await mgr.download(endpoint, [`${work}/grande.bin`], destDir);
    const downloaded = await final(down ?? '');
    expect(downloaded.state).toBe('completed');
    expect(await sha256(join(destDir, 'grande.bin'))).toBe(await sha256(src));
    expect(readdirSync(destDir)).toEqual(['grande.bin']);
    expect([...transfers.values()].every((t) => t.sessionId === 'sftp-test')).toBe(true);
  });

  it('conflito pergunta e respeita pular e substituir', async () => {
    const dir = `${work}/conflito`;
    await makeDir(sftp, dir);
    const file = join(local, 'c.txt');
    writeFileSync(file, 'original');
    const { mgr, conflicts, final, until } = manager();
    await final(mgr.upload(endpoint, [file], dir)[0] ?? '');

    writeFileSync(file, 'novo conteúdo');
    const [skip] = mgr.upload(endpoint, [file], dir);
    await until(() => conflicts.length === 1);
    expect(conflicts[0]).toMatchObject({ transferId: skip, name: 'c.txt', existingSize: 8 });
    mgr.resolveConflict(skip ?? '', 'skip');
    expect((await final(skip ?? '')).state).toBe('skipped');

    const destDir = mkdtempSync(join(tmpdir(), 'shellvault-dl-'));
    await final((await mgr.download(endpoint, [`${dir}/c.txt`], destDir))[0] ?? '');
    expect(readFileSync(join(destDir, 'c.txt'), 'utf8')).toBe('original');

    const [replace] = mgr.upload(endpoint, [file], dir);
    await until(() => conflicts.length === 2);
    mgr.resolveConflict(replace ?? '', 'replace');
    expect((await final(replace ?? '')).state).toBe('completed');

    // Download também pergunta quando o arquivo local existe.
    const [again] = await mgr.download(endpoint, [`${dir}/c.txt`], destDir);
    await until(() => conflicts.length === 3);
    mgr.resolveConflict(again ?? '', 'replace');
    expect((await final(again ?? '')).state).toBe('completed');
    expect(readFileSync(join(destDir, 'c.txt'), 'utf8')).toBe('novo conteúdo');
    expect(readdirSync(destDir)).toEqual(['c.txt']);
  });

  it('cancelar no meio não deixa arquivo final nem parcial', { timeout: 120_000 }, async () => {
    const dir = `${work}/cancelar`;
    await makeDir(sftp, dir);
    const src = await randomFile(local, 'cancela.bin', 100 * MB);
    const { mgr, transfers, final, until } = manager();

    const [up] = mgr.upload(endpoint, [src], dir);
    await until(() => (transfers.get(up ?? '')?.bytesDone ?? 0) > 0);
    mgr.cancel(up ?? '');
    expect((await final(up ?? '')).state).toBe('cancelled');
    expect(await listDir(sftp, dir)).toEqual([]);

    // Para cancelar o download no meio, primeiro o arquivo precisa estar no servidor.
    await final(mgr.upload(endpoint, [src], dir)[0] ?? '');
    const destDir = mkdtempSync(join(tmpdir(), 'shellvault-dl-'));
    const [down] = await mgr.download(endpoint, [`${dir}/cancela.bin`], destDir);
    await until(() => (transfers.get(down ?? '')?.bytesDone ?? 0) > 0);
    mgr.cancel(down ?? '');
    expect((await final(down ?? '')).state).toBe('cancelled');
    expect(readdirSync(destDir)).toEqual([]);
  });
});

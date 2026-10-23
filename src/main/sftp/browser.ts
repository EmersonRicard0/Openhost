// Operações do navegador remoto sobre um canal SFTP (FR-019, FR-022).
import { posix } from 'node:path';
import type { FileEntryWithStats, SFTPWrapper, Stats } from 'ssh2';
import type { RemoteEntry } from '@shared/model/types';

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;
const S_IFLNK = 0o120000;

export function entryType(mode: number): RemoteEntry['type'] {
  switch (mode & S_IFMT) {
    case S_IFDIR:
      return 'dir';
    case S_IFREG:
      return 'file';
    case S_IFLNK:
      return 'link';
    default:
      return 'other';
  }
}

function call<T>(fn: (cb: (err: Error | null | undefined, value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, value) => {
      if (err) reject(err);
      else resolve(value);
    });
  });
}

const done = (fn: (cb: (err: Error | null | undefined) => void) => void): Promise<void> =>
  call<undefined>((cb) => {
    fn((err) => {
      cb(err, undefined);
    });
  });

export function realPath(sftp: SFTPWrapper, path: string): Promise<string> {
  return call((cb) => {
    sftp.realpath(path, cb);
  });
}

export function statPath(sftp: SFTPWrapper, path: string): Promise<Stats> {
  return call((cb) => {
    sftp.stat(path, cb);
  });
}

/** Stat que devolve `null` quando o caminho não existe. */
export async function statIfExists(sftp: SFTPWrapper, path: string): Promise<Stats | null> {
  try {
    return await statPath(sftp, path);
  } catch (e) {
    if ((e as { code?: unknown }).code === 2) return null; // SSH_FX_NO_SUCH_FILE
    throw e;
  }
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** Pastas primeiro, depois o resto, cada grupo por nome. */
export async function listDir(sftp: SFTPWrapper, path: string): Promise<RemoteEntry[]> {
  const list = await call<FileEntryWithStats[]>((cb) => {
    sftp.readdir(path, cb);
  });
  return list
    .filter((f) => f.filename !== '.' && f.filename !== '..')
    .map((f) => ({
      name: f.filename,
      path: posix.join(path, f.filename),
      size: f.attrs.size,
      modifiedAt: new Date(f.attrs.mtime * 1000).toISOString(),
      type: entryType(f.attrs.mode),
    }))
    .sort((a, b) => {
      const dirs = Number(b.type === 'dir') - Number(a.type === 'dir');
      return dirs || collator.compare(a.name, b.name);
    });
}

export function makeDir(sftp: SFTPWrapper, path: string): Promise<void> {
  return done((cb) => {
    sftp.mkdir(path, cb);
  });
}

export function renamePath(sftp: SFTPWrapper, from: string, to: string): Promise<void> {
  return done((cb) => {
    sftp.rename(from, to, cb);
  });
}

export function unlinkPath(sftp: SFTPWrapper, path: string): Promise<void> {
  return done((cb) => {
    sftp.unlink(path, cb);
  });
}

/** Remove arquivo, link ou pasta; pasta com conteúdo só com `recursive`. */
export async function removePath(
  sftp: SFTPWrapper,
  path: string,
  recursive: boolean,
): Promise<void> {
  const stats = await call<Stats>((cb) => {
    sftp.lstat(path, cb);
  });
  if (entryType(stats.mode) !== 'dir') {
    await unlinkPath(sftp, path);
    return;
  }
  if (recursive) {
    for (const child of await listDir(sftp, path)) await removePath(sftp, child.path, true);
  }
  await done((cb) => {
    sftp.rmdir(path, cb);
  });
}

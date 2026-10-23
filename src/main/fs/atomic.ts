import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

/**
 * Grava em um temporário no mesmo diretório, faz fsync e renomeia por cima do destino.
 * Uma queda no meio deixa o arquivo anterior intacto.
 */
export function writeFileAtomic(path: string, data: Uint8Array | string): void {
  const tmp = join(dirname(path), `.${basename(path)}.${randomBytes(4).toString('hex')}.tmp`);
  const fd = openSync(tmp, 'w', 0o600);
  try {
    writeSync(fd, typeof data === 'string' ? Buffer.from(data, 'utf8') : data);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw e;
  }
  closeSync(fd);
  try {
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

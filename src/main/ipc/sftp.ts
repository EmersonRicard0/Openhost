// Navegador SFTP e transferências (contracts/ipc-bridge.md, "sftp").
// Caminhos locais vêm sempre de diálogo nativo aberto aqui, nunca da interface.
import { randomUUID } from 'node:crypto';
import { delimiter } from 'node:path';
import { dialog, type OpenDialogOptions } from 'electron';
import { z } from 'zod';
import type { MainContext } from '../context';
import { listDir, makeDir, removePath, renamePath } from '../sftp/browser';
import { SftpSession } from '../sftp/session';
import { testHooks } from '../testHooks';
import { fail } from './messages';
import { id } from './schemas';

const remotePath = z.string().min(1).max(4096);

export function registerSftpHandlers(ctx: MainContext): void {
  const { reg, sessions, interactions, vault, transfers } = ctx;

  const sftpOf = (sessionId: string): SftpSession => {
    const session = sessions.get(sessionId);
    if (!(session instanceof SftpSession)) throw fail('INVALID_INPUT');
    return session;
  };

  async function pick(options: OpenDialogOptions): Promise<string[]> {
    // Em E2E, caminhos separados por ";" substituem o diálogo.
    const fake = testHooks.dialogPath;
    if (fake) return fake.split(delimiter).filter(Boolean);
    const win = ctx.getWindow();
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return res.canceled ? [] : res.filePaths;
  }

  reg.handle(
    'sftp',
    'open',
    z.tuple([id]),
    async (hostId) => {
      const session = new SftpSession(randomUUID(), hostId, {
        registry: sessions,
        vault,
        interactions,
        transfers,
      });
      sessions.add(session);
      try {
        const homePath = await session.connect();
        return { sessionId: session.id, homePath };
      } catch (e) {
        session.close();
        sessions.remove(session.id);
        throw e;
      }
    },
    { requiresUnlocked: true },
  );

  reg.handle('sftp', 'list', z.tuple([id, remotePath]), (sessionId, path) =>
    listDir(sftpOf(sessionId).browse, path),
  );

  reg.handle('sftp', 'mkdir', z.tuple([id, remotePath]), (sessionId, path) =>
    makeDir(sftpOf(sessionId).browse, path),
  );

  reg.handle('sftp', 'rename', z.tuple([id, remotePath, remotePath]), (sessionId, from, to) =>
    renamePath(sftpOf(sessionId).browse, from, to),
  );

  reg.handle(
    'sftp',
    'remove',
    z.tuple([id, remotePath, z.boolean()]),
    (sessionId, path, recursive) => removePath(sftpOf(sessionId).browse, path, recursive),
  );

  reg.handle('sftp', 'upload', z.tuple([id, remotePath]), async (sessionId, remoteDir) => {
    const session = sftpOf(sessionId);
    const files = await pick({ properties: ['openFile', 'multiSelections'] });
    return { transferIds: files.length ? transfers.upload(session, files, remoteDir) : [] };
  });

  reg.handle(
    'sftp',
    'download',
    z.tuple([id, z.array(remotePath).min(1).max(1000)]),
    async (sessionId, paths) => {
      const session = sftpOf(sessionId);
      const [dir] = await pick({ properties: ['openDirectory', 'createDirectory'] });
      return { transferIds: dir ? await transfers.download(session, paths, dir) : [] };
    },
  );

  reg.handle(
    'sftp',
    'resolveConflict',
    z.tuple([id, z.enum(['replace', 'skip', 'cancelAll'])]),
    (transferId, choice) => {
      transfers.resolveConflict(transferId, choice);
    },
  );

  reg.handle('sftp', 'cancel', z.tuple([id]), (transferId) => {
    transfers.cancel(transferId);
  });
}

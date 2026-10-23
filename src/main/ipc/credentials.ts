import { readFileSync, statSync } from 'node:fs';
import { clipboard, dialog } from 'electron';
import { z } from 'zod';
import type { MainContext } from '../context';
import {
  MAX_KEY_BYTES,
  createPassword,
  findCredential,
  generateEd25519,
  importKey,
  removeCredential,
  renameCredential,
  toSummary,
} from '../domain/credentials';
import { testHooks } from '../testHooks';
import { fail } from './messages';
import { id } from './schemas';

const text = z.string().max(4096);
const keySource = z.union([
  z.object({ filePath: z.string().max(4096) }).strict(),
  z.object({ pem: z.string().max(MAX_KEY_BYTES) }).strict(),
]);

export function registerCredentialHandlers(ctx: MainContext): void {
  const { reg, vault } = ctx;
  const locked = { requiresUnlocked: true };
  const now = () => new Date().toISOString();
  // Só arquivos escolhidos no diálogo nativo podem ser lidos (a interface não lê caminhos).
  const pickedFiles = new Set<string>();

  reg.handle(
    'credentials',
    'list',
    z.tuple([]),
    () => {
      const content = vault.read();
      return content.credentials.map((c) => toSummary(content, c));
    },
    locked,
  );

  reg.handle(
    'credentials',
    'createPassword',
    z.tuple([text, text]),
    async (name, password) => {
      const cred = await vault.mutate((c) => createPassword(c, name, password, now()));
      return toSummary(vault.read(), cred);
    },
    locked,
  );

  reg.handle(
    'credentials',
    'pickKeyFile',
    z.tuple([]),
    async () => {
      let filePath = testHooks.dialogPath;
      if (!filePath) {
        const win = ctx.getWindow();
        const options = { properties: ['openFile' as const, 'showHiddenFiles' as const] };
        const res = win
          ? await dialog.showOpenDialog(win, options)
          : await dialog.showOpenDialog(options);
        filePath = res.canceled ? null : (res.filePaths[0] ?? null);
      }
      if (!filePath) return null;
      pickedFiles.add(filePath);
      return { filePath };
    },
    locked,
  );

  reg.handle(
    'credentials',
    'importKey',
    z.tuple([text, keySource, text.nullable()]),
    async (name, source, passphrase) => {
      let pem: string;
      if ('filePath' in source) {
        if (!pickedFiles.has(source.filePath)) throw fail('INVALID_INPUT');
        if (statSync(source.filePath).size > MAX_KEY_BYTES) throw fail('KEY_UNSUPPORTED');
        pem = readFileSync(source.filePath, 'utf8');
      } else {
        pem = source.pem;
      }
      const cred = await vault.mutate((c) => importKey(c, name, pem, passphrase || null, now()));
      return toSummary(vault.read(), cred);
    },
    locked,
  );

  reg.handle(
    'credentials',
    'generateEd25519',
    z.tuple([text, text.nullable()]),
    async (name, passphrase) => {
      const cred = await vault.mutate((c) => generateEd25519(c, name, passphrase || null, now()));
      return toSummary(vault.read(), cred);
    },
    locked,
  );

  reg.handle(
    'credentials',
    'copyPublicKey',
    z.tuple([id]),
    async (credId) => {
      const cred = findCredential(vault.read(), credId);
      if (cred.kind !== 'key') throw fail('INVALID_INPUT');
      // Chave pública não é segredo; cópia só por ação explícita do usuário.
      await clipboard.writeText(cred.publicKey);
    },
    locked,
  );

  reg.handle(
    'credentials',
    'rename',
    z.tuple([id, text]),
    async (credId, name) => {
      const cred = await vault.mutate((c) => renameCredential(c, credId, name));
      return toSummary(vault.read(), cred);
    },
    locked,
  );

  reg.handle(
    'credentials',
    'remove',
    z.tuple([id]),
    async (credId) => {
      await vault.mutate((c) => {
        removeCredential(c, credId);
      });
    },
    locked,
  );
}

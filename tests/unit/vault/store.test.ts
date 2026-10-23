import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TEST_KDF } from '../../../src/main/vault/crypto';
import { decodeVaultFile, encodeVaultFile } from '../../../src/main/vault/format';
import { VaultStore } from '../../../src/main/vault/store';

const PW = 'senha-teste-1';
const SECRET = 'segredo-de-host-🔑-çã';

async function codeOf(p: Promise<unknown> | (() => unknown)): Promise<string | undefined> {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

function filesIn(dir: string): Buffer[] {
  return readdirSync(dir).map((f) => readFileSync(join(dir, f)));
}

function containsSecret(dir: string, secret: string): boolean {
  const needles = [
    Buffer.from(secret, 'utf8'),
    Buffer.from(secret, 'utf16le'),
    Buffer.from(Buffer.from(secret, 'utf8').toString('base64')),
  ];
  return filesIn(dir).some((buf) => needles.some((n) => buf.includes(n)));
}

describe('VaultStore', () => {
  let dir: string;
  const open = () => VaultStore.open(dir, { kdf: TEST_KDF });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sv-vault-'));
  });

  it('começa como nonexistent', async () => {
    expect((await open()).status).toEqual({ state: 'nonexistent', reason: null });
  });

  it('create valida a senha mestra (FR-001)', async () => {
    const v = await open();
    expect(await codeOf(v.create('1234567', '1234567'))).toBe('WEAK_PASSWORD');
    expect(await codeOf(v.create(PW, 'outra-senha'))).toBe('INVALID_INPUT');
    // 8 caracteres contados por code point
    await v.create('🔑🔑🔑🔑🔑🔑🔑🔑', '🔑🔑🔑🔑🔑🔑🔑🔑');
    expect(v.state).toBe('unlocked');
  });

  it('create com cofre existente → VAULT_EXISTS', async () => {
    const v = await open();
    await v.create(PW, PW);
    expect(await codeOf(v.create(PW, PW))).toBe('VAULT_EXISTS');
    const again = await open();
    expect(again.state).toBe('locked');
    expect(await codeOf(again.create(PW, PW))).toBe('VAULT_EXISTS');
  });

  it('unlock com senha certa e errada', async () => {
    const v = await open();
    await v.create(PW, PW);
    await v.mutate((c) => {
      c.credentials.push({
        kind: 'password',
        id: '00000000-0000-4000-8000-000000000001',
        name: 'teste',
        password: SECRET,
        createdAt: new Date().toISOString(),
      });
    });
    v.lock();

    const reopened = await open();
    expect(reopened.state).toBe('locked');
    expect(await codeOf(reopened.unlock('senha-errada'))).toBe('VAULT_BAD_PASSWORD');
    expect(reopened.state).toBe('locked');
    await reopened.unlock(PW);
    expect(reopened.state).toBe('unlocked');
    expect(reopened.read().credentials[0]).toMatchObject({ password: SECRET });
  });

  it('cabeçalho adulterado → VAULT_BAD_PASSWORD', async () => {
    const v = await open();
    await v.create(PW, PW);
    v.lock();
    const path = join(dir, 'vault.svlt');
    const decoded = decodeVaultFile(readFileSync(path));
    const tampered = { ...decoded.header, kdf: { ...decoded.header.kdf, opsLimit: 2 } };
    writeFileSync(path, encodeVaultFile(tampered, decoded.payload).bytes);
    const reopened = await open();
    expect(await codeOf(reopened.unlock(PW))).toBe('VAULT_BAD_PASSWORD');
  });

  it('changePassword troca a senha mantendo o conteúdo (FR-004)', async () => {
    const v = await open();
    await v.create(PW, PW);
    await v.mutate((c) => {
      c.settings.autoLockMinutes = 30;
    });
    expect(await codeOf(v.changePassword('errada-123', 'nova-senha-1', 'nova-senha-1'))).toBe(
      'VAULT_BAD_PASSWORD',
    );
    expect(await codeOf(v.changePassword(PW, 'curta', 'curta'))).toBe('WEAK_PASSWORD');
    await v.changePassword(PW, 'nova-senha-1', 'nova-senha-1');
    v.lock();

    const reopened = await open();
    expect(await codeOf(reopened.unlock(PW))).toBe('VAULT_BAD_PASSWORD');
    await reopened.unlock('nova-senha-1');
    expect(reopened.read().settings.autoLockMinutes).toBe(30);
  });

  it('lock zera a chave e bloqueia leitura e escrita', async () => {
    const v = await open();
    await v.create(PW, PW);
    v.lock();
    expect(v.state).toBe('locked');
    expect(await codeOf(() => v.read())).toBe('VAULT_LOCKED');
    expect(await codeOf(v.mutate(() => undefined))).toBe('VAULT_LOCKED');
  });

  it('arquivo corrompido não é sobrescrito e fica unreadable', async () => {
    const path = join(dir, 'vault.svlt');
    writeFileSync(path, Buffer.from('lixo que não é um cofre'));
    const before = readFileSync(path);
    const v = await open();
    expect(v.status).toEqual({ state: 'unreadable', reason: 'corrupted' });
    expect(await codeOf(v.unlock(PW))).toBe('VAULT_UNREADABLE');
    expect(await codeOf(v.create(PW, PW))).toBe('VAULT_EXISTS');
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  it('versão desconhecida fica unreadable sem alterar o arquivo', async () => {
    const v = await open();
    await v.create(PW, PW);
    v.lock();
    const path = join(dir, 'vault.svlt');
    const bytes = readFileSync(path);
    bytes.writeUInt16BE(9, 4);
    writeFileSync(path, bytes);
    const reopened = await open();
    expect(reopened.status).toEqual({ state: 'unreadable', reason: 'unsupportedVersion' });
    expect(readFileSync(path).equals(bytes)).toBe(true);
  });

  it('erase remove cofre e backups (FR-006)', async () => {
    const v = await open();
    await v.create(PW, PW);
    await v.mutate((c) => {
      c.settings.connectTimeoutSeconds = 20;
    });
    expect(existsSync(join(dir, 'vault.bak'))).toBe(true);
    await v.erase();
    expect(v.state).toBe('nonexistent');
    expect(readdirSync(dir).filter((f) => f.startsWith('vault'))).toEqual([]);
  });

  it('gravação deixa vault.bak com a versão anterior', async () => {
    const v = await open();
    await v.create(PW, PW);
    const first = readFileSync(join(dir, 'vault.svlt'));
    await v.mutate((c) => {
      c.settings.connectTimeoutSeconds = 30;
    });
    expect(readFileSync(join(dir, 'vault.bak')).equals(first)).toBe(true);
    expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('mutate inválido não altera o cofre', async () => {
    const v = await open();
    await v.create(PW, PW);
    const before = readFileSync(join(dir, 'vault.svlt'));
    expect(
      await codeOf(
        v.mutate((c) => {
          c.settings.autoLockMinutes = 500;
        }),
      ),
    ).toBe('INVALID_INPUT');
    expect(v.read().settings.autoLockMinutes).toBe(15);
    expect(readFileSync(join(dir, 'vault.svlt')).equals(before)).toBe(true);
  });

  it('nenhum segredo legível nos arquivos gravados (SC-004, teste independente de US1)', async () => {
    const v = await open();
    await v.create(PW, PW);
    await v.mutate((c) => {
      c.credentials.push({
        kind: 'password',
        id: '00000000-0000-4000-8000-000000000002',
        name: 'cred',
        password: SECRET,
        createdAt: new Date().toISOString(),
      });
    });
    await v.changePassword(PW, 'nova-senha-1', 'nova-senha-1');
    v.lock();
    for (const secret of [PW, 'nova-senha-1', SECRET, 'cred']) {
      expect(containsSecret(dir, secret), secret).toBe(false);
    }
  });

  it('emite mudanças de estado', async () => {
    const v = await open();
    const seen: string[] = [];
    v.onStateChanged((s) => seen.push(s.state));
    await v.create(PW, PW);
    v.lock();
    await v.unlock(PW);
    expect(seen).toEqual(['unlocked', 'locked', 'unlocked']);
  });
});

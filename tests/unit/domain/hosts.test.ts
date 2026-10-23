import { describe, expect, it } from 'vitest';
import type { HostInput } from '../../../src/shared/model/types';
import {
  createHost,
  listHostViews,
  normalizeAddress,
  removeHost,
  updateHost,
} from '../../../src/main/domain/hosts';
import { emptyContent, type VaultContent } from '../../../src/main/vault/content';

const PW_CRED = '00000000-0000-4000-8000-0000000000a1';
const KEY_CRED = '00000000-0000-4000-8000-0000000000a2';
const T0 = '2026-10-23T10:00:00.000Z';
const T1 = '2026-10-23T11:00:00.000Z';

function content(): VaultContent {
  const c = emptyContent();
  c.credentials.push(
    { kind: 'password', id: PW_CRED, name: 'senha', password: 'x', createdAt: T0 },
    {
      kind: 'key',
      id: KEY_CRED,
      name: 'chave',
      privateKey: 'k',
      passphrase: null,
      keyType: 'ssh-ed25519',
      publicKey: 'ssh-ed25519 AAAA',
      fingerprint: 'SHA256:abc',
      origin: 'imported',
      createdAt: T0,
    },
  );
  return c;
}

const base: HostInput = {
  label: 'Servidor',
  address: 'srv.example.com',
  port: 22,
  username: 'deploy',
  authMethod: 'password',
  credentialId: PW_CRED,
  groupId: null,
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('domain/hosts', () => {
  it('cria host com datas e id', () => {
    const c = content();
    const h = createHost(c, { ...base, label: '  Servidor  ' }, T0);
    expect(h).toMatchObject({ label: 'Servidor', createdAt: T0, updatedAt: T0 });
    expect(h.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.hosts).toHaveLength(1);
  });

  it.each([
    ['label vazio', { label: '   ' }],
    ['label > 100', { label: 'x'.repeat(101) }],
    ['endereço inválido', { address: 'não é host!' }],
    ['endereço com espaço', { address: 'a b' }],
    ['porta 0', { port: 0 }],
    ['porta 65536', { port: 65536 }],
    ['porta fracionária', { port: 22.5 }],
    ['usuário vazio', { username: '' }],
    ['usuário com espaço', { username: 'de ploy' }],
    ['usuário com controle', { username: 'a\u0007b' }],
    ['usuário > 255', { username: 'u'.repeat(256) }],
    ['método desconhecido', { authMethod: 'agent' }],
  ])('rejeita %s', (_name, patch) => {
    expect(codeOf(() => createHost(content(), { ...base, ...patch } as HostInput, T0))).toBe(
      'INVALID_INPUT',
    );
  });

  it.each(['10.0.0.1', '::1', '[2001:db8::1]', 'fe80::1', 'a-b.c', 'localhost', 'SRV01'])(
    'aceita endereço %s',
    (address) => {
      expect(() => createHost(content(), { ...base, address }, T0)).not.toThrow();
    },
  );

  it('normaliza IPv6 sem colchetes', () => {
    expect(normalizeAddress('[2001:DB8::1]')).toBe('2001:db8::1');
    expect(createHost(content(), { ...base, address: '[::1]' }, T0).address).toBe('::1');
  });

  it('exige credencial quando o método não é "ask"', () => {
    expect(codeOf(() => createHost(content(), { ...base, credentialId: null }, T0))).toBe(
      'INVALID_INPUT',
    );
    const h = createHost(content(), { ...base, authMethod: 'ask', credentialId: PW_CRED }, T0);
    expect(h.credentialId).toBeNull();
  });

  it('exige que o tipo da credencial combine com o método', () => {
    expect(codeOf(() => createHost(content(), { ...base, credentialId: KEY_CRED }, T0))).toBe(
      'INVALID_INPUT',
    );
    expect(
      codeOf(() =>
        createHost(content(), { ...base, authMethod: 'key', credentialId: PW_CRED }, T0),
      ),
    ).toBe('INVALID_INPUT');
    expect(() =>
      createHost(content(), { ...base, authMethod: 'key', credentialId: KEY_CRED }, T0),
    ).not.toThrow();
  });

  it('credencial ou grupo inexistente → INVALID_INPUT', () => {
    const missing = '00000000-0000-4000-8000-0000000000ff';
    expect(codeOf(() => createHost(content(), { ...base, credentialId: missing }, T0))).toBe(
      'INVALID_INPUT',
    );
    expect(codeOf(() => createHost(content(), { ...base, groupId: missing }, T0))).toBe(
      'INVALID_INPUT',
    );
  });

  it('update mantém createdAt e muda updatedAt', () => {
    const c = content();
    const h = createHost(c, base, T0);
    const u = updateHost(c, h.id, { ...base, port: 2222 }, T1);
    expect(u).toMatchObject({ id: h.id, port: 2222, createdAt: T0, updatedAt: T1 });
    expect(codeOf(() => updateHost(c, '00000000-0000-4000-8000-0000000000ff', base, T1))).toBe(
      'NOT_FOUND',
    );
  });

  it('remove apaga regras de encaminhamento do host e mantém credenciais', () => {
    const c = content();
    const h = createHost(c, base, T0);
    c.forwardRules.push({
      id: '00000000-0000-4000-8000-0000000000b1',
      hostId: h.id,
      label: null,
      bindAddress: '127.0.0.1',
      allowNonLoopback: false,
      bindPort: 15432,
      destHost: 'db',
      destPort: 5432,
    });
    removeHost(c, h.id);
    expect(c.hosts).toHaveLength(0);
    expect(c.forwardRules).toHaveLength(0);
    expect(c.credentials).toHaveLength(2);
  });

  it('views incluem o nome da credencial e nenhum segredo', () => {
    const c = content();
    createHost(c, base, T0);
    const [view] = listHostViews(c);
    expect(view?.credentialName).toBe('senha');
    expect(JSON.stringify(view)).not.toContain('"password":"x"');
  });

  it('permite rótulos duplicados', () => {
    const c = content();
    createHost(c, base, T0);
    createHost(c, { ...base, address: '10.0.0.2' }, T0);
    expect(c.hosts).toHaveLength(2);
  });
});

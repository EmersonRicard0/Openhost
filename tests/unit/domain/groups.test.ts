import { describe, expect, it } from 'vitest';
import type { HostInput } from '../../../src/shared/model/types';
import {
  createGroup,
  listGroups,
  moveGroup,
  removeGroup,
  renameGroup,
} from '../../../src/main/domain/groups';
import { createHost, duplicateHost, moveHost } from '../../../src/main/domain/hosts';
import { emptyContent, type VaultContent } from '../../../src/main/vault/content';

const PW_CRED = '00000000-0000-4000-8000-0000000000a1';
const MISSING = '00000000-0000-4000-8000-0000000000ff';
const T0 = '2026-10-23T10:00:00.000Z';
const T1 = '2026-10-23T11:00:00.000Z';

function content(): VaultContent {
  const c = emptyContent();
  c.credentials.push({
    kind: 'password',
    id: PW_CRED,
    name: 'senha',
    password: 'x',
    createdAt: T0,
  });
  return c;
}

const hostInput = (groupId: string | null = null): HostInput => ({
  label: 'Servidor',
  address: 'srv.example.com',
  port: 22,
  username: 'deploy',
  authMethod: 'password',
  credentialId: PW_CRED,
  groupId,
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('grupos', () => {
  it('cria com nome aparado e ordem crescente entre irmãos', () => {
    const c = content();
    const a = createGroup(c, '  Produção  ', null);
    const b = createGroup(c, 'Clientes', null);
    const child = createGroup(c, 'ACME', b.id);
    expect(a).toMatchObject({ name: 'Produção', parentId: null, sortOrder: 0 });
    expect(b.sortOrder).toBe(1);
    expect(child).toMatchObject({ parentId: b.id, sortOrder: 0 });
    expect(listGroups(c).map((g) => g.name)).toEqual(['Produção', 'Clientes', 'ACME']);
  });

  it.each([
    ['vazio', '   '],
    ['> 100', 'x'.repeat(101)],
  ])('rejeita nome %s', (_, name) => {
    expect(codeOf(() => createGroup(content(), name, null))).toBe('INVALID_INPUT');
  });

  it('aceita nome com 100 caracteres e nomes iguais em pais diferentes', () => {
    const c = content();
    const p = createGroup(c, 'x'.repeat(100), null);
    createGroup(c, 'Web', null);
    expect(createGroup(c, 'Web', p.id).name).toBe('Web');
  });

  it('exige pai existente', () => {
    expect(codeOf(() => createGroup(content(), 'A', MISSING))).toBe('INVALID_INPUT');
  });

  it('renomeia e falha para grupo inexistente', () => {
    const c = content();
    const g = createGroup(c, 'A', null);
    expect(renameGroup(c, g.id, ' B ').name).toBe('B');
    expect(codeOf(() => renameGroup(c, MISSING, 'C'))).toBe('NOT_FOUND');
  });

  it('move para outro pai no fim dos irmãos e para a raiz', () => {
    const c = content();
    const a = createGroup(c, 'A', null);
    const b = createGroup(c, 'B', null);
    createGroup(c, 'B1', b.id);
    moveGroup(c, a.id, b.id);
    expect(c.groups.find((g) => g.id === a.id)).toMatchObject({ parentId: b.id, sortOrder: 1 });
    moveGroup(c, a.id, null);
    expect(c.groups.find((g) => g.id === a.id)?.parentId).toBeNull();
  });

  it('impede ciclo ao mover para si mesmo ou para descendente', () => {
    const c = content();
    const a = createGroup(c, 'A', null);
    const b = createGroup(c, 'B', a.id);
    const d = createGroup(c, 'D', b.id);
    expect(
      codeOf(() => {
        moveGroup(c, a.id, a.id);
      }),
    ).toBe('GROUP_CYCLE');
    expect(
      codeOf(() => {
        moveGroup(c, a.id, d.id);
      }),
    ).toBe('GROUP_CYCLE');
    expect(
      codeOf(() => {
        moveGroup(c, a.id, MISSING);
      }),
    ).toBe('INVALID_INPUT');
    expect(c.groups.find((g) => g.id === a.id)?.parentId).toBeNull();
  });

  it('excluir grupo sobe hosts e subgrupos diretos para a raiz sem excluir hosts', () => {
    const c = content();
    const a = createGroup(c, 'A', null);
    const b = createGroup(c, 'B', a.id);
    const deep = createGroup(c, 'C', b.id);
    const h1 = createHost(c, hostInput(a.id), T0);
    const h2 = createHost(c, hostInput(b.id), T0);
    removeGroup(c, a.id);
    expect(c.groups.map((g) => g.id)).toEqual([b.id, deep.id]);
    expect(c.groups.find((g) => g.id === b.id)?.parentId).toBeNull();
    expect(c.groups.find((g) => g.id === deep.id)?.parentId).toBe(b.id);
    expect(c.hosts.find((h) => h.id === h1.id)?.groupId).toBeNull();
    expect(c.hosts.find((h) => h.id === h2.id)?.groupId).toBe(b.id);
    expect(
      codeOf(() => {
        removeGroup(c, a.id);
      }),
    ).toBe('NOT_FOUND');
  });
});

describe('mover e duplicar host', () => {
  it('move host entre grupos e para a raiz', () => {
    const c = content();
    const g = createGroup(c, 'A', null);
    const h = createHost(c, hostInput(), T0);
    moveHost(c, h.id, g.id, T1);
    expect(c.hosts[0]).toMatchObject({ groupId: g.id, updatedAt: T1 });
    moveHost(c, h.id, null, T1);
    expect(c.hosts[0]?.groupId).toBeNull();
    expect(
      codeOf(() => {
        moveHost(c, h.id, MISSING, T1);
      }),
    ).toBe('INVALID_INPUT');
    expect(
      codeOf(() => {
        moveHost(c, MISSING, null, T1);
      }),
    ).toBe('NOT_FOUND');
  });

  it('duplica com novo id, rótulo "(cópia)", mesma credencial e regras copiadas', () => {
    const c = content();
    const g = createGroup(c, 'A', null);
    const h = createHost(c, hostInput(g.id), T0);
    c.forwardRules.push({
      id: '00000000-0000-4000-8000-0000000000b1',
      hostId: h.id,
      label: 'db',
      bindAddress: '127.0.0.1',
      allowNonLoopback: false,
      bindPort: 15432,
      destHost: 'db.internal',
      destPort: 5432,
    });
    const copy = duplicateHost(c, h.id, T1);
    expect(copy.id).not.toBe(h.id);
    expect(copy).toMatchObject({
      label: 'Servidor (cópia)',
      credentialId: PW_CRED,
      groupId: g.id,
      createdAt: T1,
      updatedAt: T1,
    });
    expect(c.hosts).toHaveLength(2);
    const copied = c.forwardRules.filter((r) => r.hostId === copy.id);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toMatchObject({ label: 'db', destHost: 'db.internal', destPort: 5432 });
    expect(copied[0]?.id).not.toBe('00000000-0000-4000-8000-0000000000b1');
    // bindPort é único por bindAddress: a cópia recebe a próxima porta livre.
    expect(copied[0]?.bindPort).toBe(15433);
  });

  it('mantém o rótulo da cópia dentro de 100 caracteres', () => {
    const c = content();
    const h = createHost(c, { ...hostInput(), label: 'x'.repeat(100) }, T0);
    const copy = duplicateHost(c, h.id, T1);
    expect(copy.label.length).toBeLessThanOrEqual(100);
    expect(copy.label.endsWith(' (cópia)')).toBe(true);
  });
});

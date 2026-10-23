import { describe, expect, it } from 'vitest';
import type { Group, HostView } from '../../../src/shared/model/types';
import {
  buildRows,
  groupPaths,
  selfAndDescendants,
} from '../../../src/renderer/features/hosts/tree';

const g = (id: string, name: string, parentId: string | null, sortOrder = 0): Group => ({
  id,
  name,
  parentId,
  sortOrder,
});

const h = (id: string, label: string, groupId: string | null): HostView => ({
  id,
  label,
  address: 'srv',
  port: 22,
  username: 'u',
  authMethod: 'ask',
  credentialId: null,
  credentialName: null,
  groupId,
  createdAt: '',
  updatedAt: '',
});

const groups = [g('b', 'Clientes', null, 1), g('a', 'Produção', null, 0), g('c', 'ACME', 'b')];
const hosts = [
  h('h1', 'web', 'a'),
  h('h2', 'Banco', 'c'),
  h('h3', 'avulso', null),
  h('h4', 'api', 'a'),
];

const names = (rows: ReturnType<typeof buildRows>) =>
  rows.map((r) => `${' '.repeat(r.depth)}${r.kind === 'group' ? r.group.name : r.host.label}`);

describe('árvore de hosts', () => {
  it('ordena grupos por sortOrder, hosts por rótulo, subgrupos antes dos hosts', () => {
    expect(names(buildRows(groups, hosts, new Set()))).toEqual([
      'Produção',
      ' api',
      ' web',
      'Clientes',
      ' ACME',
      '  Banco',
      'avulso',
    ]);
  });

  it('grupos recolhidos escondem descendentes e informam contagem de hosts', () => {
    const rows = buildRows(groups, hosts, new Set(['b']));
    expect(names(rows)).toEqual(['Produção', ' api', ' web', 'Clientes', 'avulso']);
    expect(rows[0]).toMatchObject({ kind: 'group', expanded: true, hostCount: 2 });
    expect(rows[3]).toMatchObject({ kind: 'group', expanded: false, hostCount: 0 });
  });

  it('host com grupo inexistente aparece na raiz', () => {
    expect(names(buildRows([], [h('x', 'órfão', 'sumiu')], new Set()))).toEqual(['órfão']);
  });

  it('monta caminhos e descendentes', () => {
    expect(groupPaths(groups).get('c')).toBe('Clientes / ACME');
    expect([...selfAndDescendants(groups, 'b')].sort()).toEqual(['b', 'c']);
  });
});

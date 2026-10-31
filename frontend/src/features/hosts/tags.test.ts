import { describe, expect, it } from 'vitest';
import type { HostView } from '@shared/model/types';
import { buildIndex, filterHosts } from './search';
import { addTag, MAX_TAGS, splitTags } from './tags';

describe('tags do host (009, FR-916)', () => {
  it('texto colado com vírgulas vira tags e o resto fica no campo', () => {
    expect(splitTags(['olt'], 'cliente-x, bng ,pop')).toEqual({
      tags: ['olt', 'cliente-x', 'bng'],
      draft: 'pop',
    });
    expect(splitTags([], 'a,,b,')).toEqual({ tags: ['a', 'b'], draft: '' });
    expect(splitTags(['olt'], 'x,OLT,y')).toEqual({
      tags: ['olt', 'x'],
      draft: 'OLT,y',
      error: 'duplicate',
    });
  });

  it('adiciona sem espaços nas pontas e mantém a ordem', () => {
    expect(addTag(['olt'], '  cliente-x ')).toEqual({ tags: ['olt', 'cliente-x'] });
  });

  it('recusa vazia, repetida (sem diferenciar maiúsculas), longa e acima do limite', () => {
    expect(addTag([], '   ')).toEqual({ tags: [] });
    expect(addTag(['OLT'], 'olt')).toEqual({ error: 'duplicate' });
    expect(addTag([], 'x'.repeat(33))).toEqual({ error: 'tooLong' });
    const full = Array.from({ length: MAX_TAGS }, (_, i) => `t${String(i)}`);
    expect(addTag(full, 'mais')).toEqual({ error: 'limit' });
  });
});

describe('busca por tags e nota (009, FR-917, SC-904)', () => {
  const host = (i: number, extra: Partial<HostView> = {}): HostView => ({
    id: `h${String(i)}`,
    label: `host-${String(i)}`,
    address: `10.0.${String(i >> 8)}.${String(i & 255)}`,
    port: 22,
    username: 'ops',
    authMethod: 'password',
    credentialId: null,
    credentialName: null,
    groupId: null,
    legacyAlgorithms: false,
    createdAt: '',
    updatedAt: '',
    ...extra,
  });
  const hosts = Array.from({ length: 500 }, (_, i) => host(i));
  hosts[321] = host(321, { tags: ['Clíente-X', 'olt'], notes: 'VLAN 100, janela às 2h' });

  it.each(['cliente', 'OLT', 'vlan 100', 'janela as'])('%s encontra só o host marcado', (q) => {
    expect(filterHosts(buildIndex(hosts), q).map((h) => h.id)).toEqual(['h321']);
  });
});

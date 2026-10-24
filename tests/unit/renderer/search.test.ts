import { describe, expect, it } from 'vitest';
import type { HostView } from '../../../frontend/src/shared/model/types';
import { buildIndex, filterHosts } from '../../../frontend/src/features/hosts/search';

function host(i: number, overrides: Partial<HostView> = {}): HostView {
  return {
    id: `id-${String(i)}`,
    label: `Servidor ${String(i)}`,
    address: `10.0.${String(Math.floor(i / 256))}.${String(i % 256)}`,
    port: 22,
    username: 'deploy',
    authMethod: 'ask',
    credentialId: null,
    credentialName: null,
    groupId: null,
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T10:00:00.000Z',
    ...overrides,
  };
}

const hosts = [
  host(1, { label: 'Produção Web' }),
  host(2, { label: 'ACME banco', address: 'db.acme.com.br' }),
  host(3, { label: 'Homologação', username: 'José' }),
];

const labels = (q: string) => filterHosts(buildIndex(hosts), q).map((h) => h.label);

describe('busca de hosts', () => {
  it('consulta vazia devolve todos', () => {
    expect(labels('')).toHaveLength(3);
    expect(labels('   ')).toHaveLength(3);
  });

  it('casa substring no rótulo ignorando maiúsculas e acentos', () => {
    expect(labels('producao')).toEqual(['Produção Web']);
    expect(labels('PRODUÇÃO')).toEqual(['Produção Web']);
    expect(labels('acme')).toEqual(['ACME banco']);
  });

  it('casa no endereço e no usuário', () => {
    expect(labels('.acme.com')).toEqual(['ACME banco']);
    expect(labels('10.0.0.1')).toEqual(['Produção Web']);
    expect(labels('jose')).toEqual(['Homologação']);
  });

  it('não casa nada quando não há correspondência', () => {
    expect(labels('inexistente')).toEqual([]);
  });

  it('com 1.000 hosts cada consulta leva menos de 200 ms (SC-003)', () => {
    const many = Array.from({ length: 1000 }, (_, i) => host(i));
    const index = buildIndex(many);
    for (const q of ['servidor 99', '10.0.3', 'deploy', 'nada']) {
      const start = performance.now();
      filterHosts(index, q);
      expect(performance.now() - start).toBeLessThan(200);
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { HostView, RecentEntry } from '@shared/model/types';
import { visibleRecents } from './recents';

const host = (id: string, favorite = false): HostView => ({
  id,
  label: id,
  address: `${id}.example`,
  port: 22,
  username: 'ops',
  authMethod: 'password',
  credentialId: null,
  credentialName: null,
  groupId: null,
  legacyAlgorithms: false,
  favorite,
  createdAt: '',
  updatedAt: '',
});

const at = '2026-10-27T12:00:00Z';

describe('recentes da tela inicial (010, FR-1009)', () => {
  it('resolve hosts, descarta excluídos e favoritos, mantém a ordem e corta em 8', () => {
    const hosts = [host('a'), host('b', true), host('c')];
    const recents: RecentEntry[] = [
      { kind: 'host', hostId: 'c', at },
      { kind: 'quick', address: '10.0.0.1', port: 2222, username: 'root', at },
      { kind: 'host', hostId: 'b', at },
      { kind: 'host', hostId: 'apagado', at },
      { kind: 'host', hostId: 'a', at },
    ];
    expect(
      visibleRecents(recents, hosts).map((r) => (r.kind === 'host' ? r.host.id : r.label)),
    ).toEqual(['c', 'root@10.0.0.1:2222', 'a']);

    const many: RecentEntry[] = Array.from({ length: 12 }, (_, i) => ({
      kind: 'quick',
      address: `10.0.0.${String(i)}`,
      port: 22,
      username: 'u',
      at,
    }));
    expect(visibleRecents(many, [])).toHaveLength(8);
  });
});

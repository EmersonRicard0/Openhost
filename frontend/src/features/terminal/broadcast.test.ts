import { describe, expect, it } from 'vitest';
import type { Group, Tab } from '../../stores/sessions';
import { broadcastTargets, productionPanes } from './broadcast';
import { insert, leaf } from './layout';

const tab = (id: string, state: Tab['state'] = 'connected', hostId: string | null = null): Tab => ({
  id,
  kind: 'ssh',
  title: id,
  hostId,
  shell: null,
  state,
  reason: null,
  exitCode: null,
  latencyMs: null,
  baseTitle: id,
  manualTitle: false,
  promptTitle: null,
});

function group(ids: string[], broadcast?: Group['broadcast']): Group {
  let root = leaf(ids[0] ?? '');
  for (const id of ids.slice(1)) root = insert(root, ids[0] ?? '', 'right', id);
  return { id: 'g1', root, focusId: ids[0] ?? '', ...(broadcast && { broadcast }) };
}

describe('destinos da transmissão (012, data-model)', () => {
  const tabs = [tab('A'), tab('B'), tab('C'), tab('D', 'disconnected'), tab('X')];

  it('membros do grupo menos o ativo, os desmarcados e os não conectados', () => {
    const groups = { g1: group(['A', 'B', 'C', 'D'], { excluded: ['C'] }) };
    expect(broadcastTargets(tabs, groups, 'A')).toEqual(['B']);
    expect(broadcastTargets(tabs, groups, 'B')).toEqual(['A']);
  });

  it('modo desligado, sessão fora de grupo ou ativo nulo: ninguém', () => {
    expect(broadcastTargets(tabs, { g1: group(['A', 'B']) }, 'A')).toEqual([]);
    expect(broadcastTargets(tabs, { g1: group(['A', 'B'], { excluded: [] }) }, 'X')).toEqual([]);
    expect(broadcastTargets(tabs, { g1: group(['A', 'B'], { excluded: [] }) }, null)).toEqual([]);
  });

  it('painéis de produção pelo ambiente prod do host', () => {
    const hosts = [
      { id: 'h1', environmentId: 'prod' },
      { id: 'h2', environmentId: 'lab' },
      { id: 'h3', environmentId: null },
    ];
    const members = [tab('A', 'connected', 'h1'), tab('B', 'connected', 'h2'), tab('C'), tab('E', 'connected', 'h3')];
    expect(productionPanes(members, hosts).map((t) => t.id)).toEqual(['A']);
  });
});

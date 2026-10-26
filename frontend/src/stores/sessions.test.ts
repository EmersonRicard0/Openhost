import { beforeEach, describe, expect, it } from 'vitest';
import { leaves, rects } from '../features/terminal/layout';
import { groupOf, stripItems, useSessions, type Tab } from './sessions';

function open(id: string, kind: Tab['kind'] = 'local'): void {
  useSessions
    .getState()
    .add({ id, kind, title: id, hostId: null, shell: null, state: 'connected' });
}

const state = () => useSessions.getState();
const membersOf = (id: string) => {
  const group = groupOf(state().groups, id);
  return group ? leaves(group.root) : [];
};
const strip = () =>
  stripItems(state().tabs, state().groups).map((item) =>
    item.kind === 'tab' ? item.tab.id : `[${item.members.map((t) => t.id).join(',')}]`,
  );

describe('grupos de sessões no store (006, data-model)', () => {
  beforeEach(() => {
    useSessions.setState({ tabs: [], activeId: null, groups: {} });
    for (const id of ['A', 'B', 'C', 'D', 'E']) open(id);
  });

  it('juntar cria o grupo na posição do destino e foca a sessão que entrou', () => {
    state().join('D', 'B', 'right');
    expect(strip()).toEqual(['A', '[B,D]', 'C', 'E']);
    expect(state().activeId).toBe('D');
    const group = groupOf(state().groups, 'B');
    expect(group && leaves(group.root)).toEqual(['B', 'D']);
    expect(group?.focusId).toBe('D');
  });

  it('juntar a um grupo existente divide o painel de destino; o limite é 4', () => {
    state().join('B', 'A', 'right');
    state().join('C', 'B', 'bottom');
    state().join('D', 'A', 'bottom');
    const group = groupOf(state().groups, 'A');
    expect(membersOf('A')).toEqual(['A', 'D', 'B', 'C']);
    expect(group && rects(group.root).panes.C).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    state().join('E', 'A', 'right');
    expect(membersOf('A')).toHaveLength(4);
    expect(groupOf(state().groups, 'E')).toBeUndefined();
  });

  it('não junta SFTP nem a sessão sobre ela mesma', () => {
    open('S', 'sftp');
    state().join('S', 'A', 'right');
    state().join('A', 'S', 'right');
    state().join('A', 'A', 'right');
    expect(state().groups).toEqual({});
  });

  it('arrastar um painel do mesmo grupo reorganiza', () => {
    state().join('B', 'A', 'right');
    state().join('C', 'B', 'bottom');
    state().join('A', 'C', 'right');
    expect(membersOf('A')).toEqual(['B', 'C', 'A']);
  });

  it('separar devolve a sessão a uma aba logo depois do grupo', () => {
    state().join('B', 'A', 'right');
    state().join('C', 'A', 'bottom');
    state().splitOut('C');
    expect(strip()).toEqual(['[A,B]', 'C', 'D', 'E']);
    expect(state().activeId).toBe('C');
  });

  it('com uma sessão restante o grupo se desfaz', () => {
    state().join('B', 'A', 'right');
    state().splitOut('B');
    expect(state().groups).toEqual({});
    expect(strip()).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('fechar uma sessão do grupo foca outra do mesmo grupo', () => {
    state().join('B', 'A', 'right');
    state().join('C', 'A', 'bottom');
    state().activate('C');
    state().close('C');
    expect(state().activeId).toBe('A');
    expect(membersOf('A')).toEqual(['A', 'B']);
    state().close('B');
    expect(state().groups).toEqual({});
    expect(state().activeId).toBe('A');
  });

  it('ativar um painel lembra o foco do grupo', () => {
    state().join('B', 'A', 'right');
    state().activate('A');
    state().activate('E');
    const item = stripItems(state().tabs, state().groups).find((i) => i.kind === 'group');
    expect(item?.kind === 'group' && item.focus.id).toBe('A');
  });

  it('juntar um painel de outro grupo o tira de lá', () => {
    state().join('B', 'A', 'right');
    state().join('D', 'C', 'right');
    state().join('B', 'C', 'bottom');
    expect(groupOf(state().groups, 'A')).toBeUndefined();
    expect(membersOf('C')).toEqual(['C', 'B', 'D']);
  });
});

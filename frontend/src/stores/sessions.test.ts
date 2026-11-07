import { beforeEach, describe, expect, it } from 'vitest';
import { leaves, rects } from '../features/terminal/layout';
import { closeGroup, cycleTab } from '../features/terminal/commands';
import { useWorkspace } from './workspace';
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

  it('reordenar move o grupo em bloco e solta antes do grupo inteiro', () => {
    state().join('C', 'B', 'right');
    state().reorder('B', 'A');
    expect(strip()).toEqual(['[B,C]', 'A', 'D', 'E']);
    state().reorder('E', 'C');
    expect(strip()).toEqual(['E', '[B,C]', 'A', 'D']);
    state().reorder('B', null);
    expect(strip()).toEqual(['E', 'A', 'D', '[B,C]']);
  });

  it('próxima aba trata o grupo como um item e volta ao painel focado', () => {
    state().join('C', 'B', 'right');
    state().activate('A');
    cycleTab(1);
    expect(state().activeId).toBe('C');
    cycleTab(1);
    expect(state().activeId).toBe('D');
    cycleTab(-1);
    cycleTab(-1);
    expect(state().activeId).toBe('A');
  });

  it('fechar a aba do grupo com conexão SSH ativa pede uma confirmação só (FR-613)', () => {
    open('S1', 'ssh');
    open('S2', 'ssh');
    state().join('S2', 'S1', 'right');
    state().join('A', 'S1', 'bottom');
    const group = groupOf(state().groups, 'S1');
    if (!group) throw new Error('sem grupo');
    closeGroup(group.id);
    expect(useWorkspace.getState().confirmClose).toBe(group.id);
    expect(state().tabs.map((t) => t.id)).toContain('S1');
    useWorkspace.getState().setConfirmClose(null);
  });

  it('juntar um painel de outro grupo o tira de lá', () => {
    state().join('B', 'A', 'right');
    state().join('D', 'C', 'right');
    state().join('B', 'C', 'bottom');
    expect(groupOf(state().groups, 'A')).toBeUndefined();
    expect(membersOf('C')).toEqual(['C', 'B', 'D']);
  });
});

describe('nome da aba pelo prompt (009, FR-922–FR-925)', () => {
  const title = (id: string) => state().tabs.find((t) => t.id === id)?.title;

  beforeEach(() => {
    useSessions.setState({ tabs: [], activeId: null, groups: {}, promptTitles: true });
    open('A', 'ssh');
    open('B', 'ssh');
  });

  it('o prompt troca o título; sem prompt volta o rótulo', () => {
    state().setPromptTitle('A', 'BNG.PINDORETAMA');
    expect(title('A')).toBe('BNG.PINDORETAMA');
    state().setPromptTitle('A', null);
    expect(title('A')).toBe('A');
  });

  it('aba renomeada à mão não muda com o prompt', () => {
    state().rename('A', 'meu nome');
    state().setPromptTitle('A', 'R1');
    expect(title('A')).toBe('meu nome');
  });

  it('desligar devolve o rótulo às abas não renomeadas; religar volta o prompt', () => {
    state().setPromptTitle('A', 'R1');
    state().rename('B', 'manual');
    state().setPromptTitles(false);
    expect([title('A'), title('B')]).toEqual(['A', 'manual']);
    state().setPromptTitle('A', 'R2');
    expect(title('A')).toBe('A');
    state().setPromptTitles(true);
    expect(title('A')).toBe('R2');
  });
});

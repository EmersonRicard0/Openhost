import { describe, expect, it } from 'vitest';
import {
  clampRatio,
  clampSplit,
  dropVerdict,
  equalize,
  insert,
  leaf,
  leaves,
  minExtent,
  move,
  neighbor,
  nodeAt,
  rects,
  remove,
  setRatio,
  type LayoutNode,
} from './layout';

/** 2×2: A B em cima, C D embaixo. */
function grid(): LayoutNode {
  let root = insert(leaf('A'), 'A', 'right', 'B');
  root = insert(root, 'A', 'bottom', 'C');
  return insert(root, 'B', 'bottom', 'D');
}

describe('layout dos grupos (006, data-model)', () => {
  it('insere nos quatro lados dividindo o painel ao meio', () => {
    expect(insert(leaf('A'), 'A', 'right', 'B')).toEqual({
      kind: 'split',
      dir: 'row',
      ratio: 0.5,
      a: leaf('A'),
      b: leaf('B'),
    });
    expect(insert(leaf('A'), 'A', 'left', 'B')).toMatchObject({ dir: 'row', a: leaf('B') });
    expect(insert(leaf('A'), 'A', 'top', 'B')).toMatchObject({ dir: 'column', a: leaf('B') });
    expect(insert(leaf('A'), 'A', 'bottom', 'B')).toMatchObject({ dir: 'column', b: leaf('B') });
  });

  it('insere ao lado de um painel aninhado sem mexer nos outros', () => {
    const root = grid();
    expect(leaves(root)).toEqual(['A', 'C', 'B', 'D']);
    expect(rects(root).panes.D).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it('remover sobe o irmão; com uma folha só a árvore vira essa folha', () => {
    const two = insert(leaf('A'), 'A', 'right', 'B');
    expect(remove(two, 'B')).toEqual(leaf('A'));
    expect(remove(leaf('A'), 'A')).toBeNull();
    const root = remove(grid(), 'C') ?? leaf('vazio');
    expect(leaves(root)).toEqual(['A', 'B', 'D']);
    expect(rects(root).panes.A).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
  });

  it('mover tira de um lugar e põe ao lado de outro', () => {
    const root = move(grid(), 'A', 'D', 'right');
    expect(leaves(root)).toEqual(['C', 'B', 'D', 'A']);
    expect(rects(root).panes.C).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
  });

  it('proporção ajustável, limitada e igualável', () => {
    const two = insert(leaf('A'), 'A', 'right', 'B');
    const wide = setRatio(two, [], 0.7);
    expect(rects(wide).panes.A?.w).toBeCloseTo(0.7);
    expect(rects(setRatio(two, [], 2)).panes.A?.w).toBeCloseTo(0.95);
    expect(rects(equalize(wide, [])).panes.A?.w).toBeCloseTo(0.5);
    // Mínimo em pixels: 800 px, cada lado com pelo menos 200.
    expect(clampRatio(0.1, 800, 200)).toBeCloseTo(0.25);
    expect(clampRatio(0.9, 800, 200)).toBeCloseTo(0.75);
    expect(clampRatio(0.6, 800, 200)).toBeCloseTo(0.6);
  });

  it('retângulos das divisórias ficam na fronteira entre painéis', () => {
    const { dividers } = rects(insert(leaf('A'), 'A', 'right', 'B'));
    expect(dividers).toEqual([
      {
        path: [],
        dir: 'row',
        x: 0.5,
        y: 0,
        w: 0,
        h: 1,
        ratio: 0.5,
        area: { x: 0, y: 0, w: 1, h: 1 },
      },
    ]);
  });

  it('mínimo por subárvore e proporção limitada pelos dois lados', () => {
    const root = grid();
    expect(nodeAt(root, ['a'])).toEqual(insert(leaf('A'), 'A', 'bottom', 'C'));
    expect(nodeAt(root, ['a', 'a', 'a'])).toBeNull();
    // Lado a lado na direção somam; empilhados não.
    expect(minExtent(root, 'row', 100)).toBe(200);
    expect(minExtent(root, 'column', 50)).toBe(100);
    expect(clampSplit(0.1, 1000, 200, 100)).toBeCloseTo(0.2);
    expect(clampSplit(0.95, 1000, 200, 100)).toBeCloseTo(0.9);
    expect(clampSplit(0.3, 200, 150, 100)).toBe(0.5);
  });

  it('vizinho nas quatro direções', () => {
    const root = grid();
    expect(neighbor(root, 'A', 'right')).toBe('B');
    expect(neighbor(root, 'A', 'bottom')).toBe('C');
    expect(neighbor(root, 'D', 'left')).toBe('C');
    expect(neighbor(root, 'D', 'top')).toBe('B');
    expect(neighbor(root, 'A', 'left')).toBeNull();
    // Um grande à esquerda e dois empilhados à direita.
    let big = insert(leaf('A'), 'A', 'right', 'B');
    big = insert(big, 'B', 'bottom', 'C');
    expect(neighbor(big, 'C', 'left')).toBe('A');
    expect(neighbor(big, 'A', 'right')).toBe('B');
  });

  it('recusa soltar com o motivo certo', () => {
    const base = {
      dragId: 'B',
      targetId: 'A',
      dragKind: 'session',
      targetKind: 'terminal',
      targetGroupSize: 1,
      sameGroup: false,
      side: 'right',
      targetSize: { w: 800, h: 600 },
      minSize: { w: 200, h: 120 },
    } as const;
    expect(dropVerdict(base)).toBe('ok');
    expect(dropVerdict({ ...base, dragId: 'A' })).toBe('self');
    expect(dropVerdict({ ...base, targetGroupSize: 4 })).toBe('full');
    // Mover dentro do mesmo grupo cheio é permitido.
    expect(dropVerdict({ ...base, targetGroupSize: 4, sameGroup: true })).toBe('ok');
    expect(dropVerdict({ ...base, dragKind: 'group' })).toBe('group');
    expect(dropVerdict({ ...base, dragKind: 'sftp' })).toBe('sftp');
    expect(dropVerdict({ ...base, targetKind: 'sftp' })).toBe('sftp');
    expect(dropVerdict({ ...base, targetSize: { w: 300, h: 600 } })).toBe('tooSmall');
    expect(dropVerdict({ ...base, side: 'bottom', targetSize: { w: 300, h: 600 } })).toBe('ok');
  });
});

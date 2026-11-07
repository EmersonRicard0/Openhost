// Disposição dos painéis de um grupo (specs/006, data-model.md): árvore binária de divisões com
// proporções. Funções puras; o store guarda a árvore e o Workspace posiciona os terminais por
// `rects`, sem nunca remontar um xterm.

export type Side = 'left' | 'right' | 'top' | 'bottom';
/** `row`: `a` à esquerda e `b` à direita; `column`: `a` em cima e `b` embaixo. */
export type SplitDir = 'row' | 'column';

export type LayoutNode =
  | { kind: 'leaf'; id: string }
  | { kind: 'split'; dir: SplitDir; ratio: number; a: LayoutNode; b: LayoutNode };

/** Caminho da raiz até uma divisão. */
export type Path = readonly ('a' | 'b')[];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DividerRect extends Rect {
  path: Path;
  dir: SplitDir;
  ratio: number;
  /** Área da divisão inteira; a proporção é medida nela. */
  area: Rect;
}

export const MAX_PANES = 4;
/** Limites de `setRatio` sem medida em pixels; o Divider aplica o mínimo real (`clampRatio`). */
const MIN_RATIO = 0.05;

export const leaf = (id: string): LayoutNode => ({ kind: 'leaf', id });

export function leaves(node: LayoutNode): string[] {
  return node.kind === 'leaf' ? [node.id] : [...leaves(node.a), ...leaves(node.b)];
}

/** Troca a folha `targetId` por uma divisão com `newId` no lado pedido, meio a meio. */
export function insert(node: LayoutNode, targetId: string, side: Side, newId: string): LayoutNode {
  if (node.kind === 'leaf') {
    if (node.id !== targetId) return node;
    const dir: SplitDir = side === 'left' || side === 'right' ? 'row' : 'column';
    const first = side === 'left' || side === 'top';
    return {
      kind: 'split',
      dir,
      ratio: 0.5,
      a: first ? leaf(newId) : node,
      b: first ? node : leaf(newId),
    };
  }
  return {
    ...node,
    a: insert(node.a, targetId, side, newId),
    b: insert(node.b, targetId, side, newId),
  };
}

/** Tira a folha; o irmão ocupa o lugar do pai. `null` quando não sobra nada. */
export function remove(node: LayoutNode, id: string): LayoutNode | null {
  if (node.kind === 'leaf') return node.id === id ? null : node;
  const a = remove(node.a, id);
  const b = remove(node.b, id);
  if (!a) return b;
  if (!b) return a;
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

export function move(node: LayoutNode, id: string, targetId: string, side: Side): LayoutNode {
  if (id === targetId) return node;
  const without = remove(node, id);
  return without ? insert(without, targetId, side, id) : node;
}

function update(node: LayoutNode, path: Path, fn: (split: LayoutNode) => LayoutNode): LayoutNode {
  if (path.length === 0) return fn(node);
  if (node.kind === 'leaf') return node;
  const [head, ...rest] = path;
  return head === 'a'
    ? { ...node, a: update(node.a, rest, fn) }
    : { ...node, b: update(node.b, rest, fn) };
}

export function setRatio(node: LayoutNode, path: Path, ratio: number): LayoutNode {
  const clamped = Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, ratio));
  return update(node, path, (n) => (n.kind === 'split' ? { ...n, ratio: clamped } : n));
}

export const equalize = (node: LayoutNode, path: Path): LayoutNode => setRatio(node, path, 0.5);

export function nodeAt(node: LayoutNode, path: Path): LayoutNode | null {
  let cur: LayoutNode = node;
  for (const step of path) {
    if (cur.kind === 'leaf') return null;
    cur = step === 'a' ? cur.a : cur.b;
  }
  return cur;
}

/**
 * Menor extensão de uma subárvore na direção da divisão (`row`: largura; `column`: altura), com
 * `min` por painel: painéis lado a lado na mesma direção somam, os empilhados não.
 */
export function minExtent(node: LayoutNode, dir: SplitDir, min: number): number {
  if (node.kind === 'leaf') return min;
  const a = minExtent(node.a, dir, min);
  const b = minExtent(node.b, dir, min);
  return node.dir === dir ? a + b : Math.max(a, b);
}

/** Proporção de uma divisão com `totalPx`, sem deixar `a` ou `b` abaixo do mínimo de cada um. */
export function clampSplit(ratio: number, totalPx: number, minA: number, minB: number): number {
  if (totalPx <= 0 || minA + minB >= totalPx) return 0.5;
  return Math.min(1 - minB / totalPx, Math.max(minA / totalPx, ratio));
}

/** Limita a proporção para os dois lados terem pelo menos `minPx` num total de `totalPx`. */
export function clampRatio(ratio: number, totalPx: number, minPx: number): number {
  if (totalPx <= 0) return ratio;
  const low = Math.min(0.5, minPx / totalPx);
  return Math.min(1 - low, Math.max(low, ratio));
}

/** Retângulos, em frações da área do grupo, de cada painel e de cada divisória. */
export function rects(root: LayoutNode): { panes: Record<string, Rect>; dividers: DividerRect[] } {
  const panes: Record<string, Rect> = {};
  const dividers: DividerRect[] = [];
  const walk = (node: LayoutNode, r: Rect, path: Path) => {
    if (node.kind === 'leaf') {
      panes[node.id] = r;
      return;
    }
    if (node.dir === 'row') {
      const w = r.w * node.ratio;
      dividers.push({
        path,
        dir: 'row',
        x: r.x + w,
        y: r.y,
        w: 0,
        h: r.h,
        ratio: node.ratio,
        area: r,
      });
      walk(node.a, { x: r.x, y: r.y, w, h: r.h }, [...path, 'a']);
      walk(node.b, { x: r.x + w, y: r.y, w: r.w - w, h: r.h }, [...path, 'b']);
    } else {
      const h = r.h * node.ratio;
      dividers.push({
        path,
        dir: 'column',
        x: r.x,
        y: r.y + h,
        w: r.w,
        h: 0,
        ratio: node.ratio,
        area: r,
      });
      walk(node.a, { x: r.x, y: r.y, w: r.w, h }, [...path, 'a']);
      walk(node.b, { x: r.x, y: r.y + h, w: r.w, h: r.h - h }, [...path, 'b']);
    }
  };
  walk(root, { x: 0, y: 0, w: 1, h: 1 }, []);
  return { panes, dividers };
}

const EPS = 1e-6;

/** Painel vizinho na direção: encosta na borda e mais se sobrepõe no outro eixo. */
export function neighbor(root: LayoutNode, id: string, side: Side): string | null {
  const { panes } = rects(root);
  const from = panes[id];
  if (!from) return null;
  let best: { id: string; overlap: number } | null = null;
  for (const [other, r] of Object.entries(panes)) {
    if (other === id) continue;
    const touches =
      side === 'left'
        ? Math.abs(r.x + r.w - from.x) < EPS
        : side === 'right'
          ? Math.abs(from.x + from.w - r.x) < EPS
          : side === 'top'
            ? Math.abs(r.y + r.h - from.y) < EPS
            : Math.abs(from.y + from.h - r.y) < EPS;
    if (!touches) continue;
    const horizontal = side === 'left' || side === 'right';
    const overlap = horizontal
      ? Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
      : Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x);
    if (overlap > EPS && (!best || overlap > best.overlap)) best = { id: other, overlap };
  }
  return best?.id ?? null;
}

export type DropVerdict = 'ok' | 'self' | 'full' | 'group' | 'sftp' | 'tooSmall';

export interface DropInput {
  dragId: string;
  targetId: string;
  /** O que está sendo arrastado: sessão de terminal, aba de grupo ou aba SFTP. */
  dragKind: 'session' | 'group' | 'sftp';
  targetKind: 'terminal' | 'sftp';
  /** Sessões no grupo do destino (1 quando avulsa). */
  targetGroupSize: number;
  /** Arrastando um painel do próprio grupo (reorganizar). */
  sameGroup: boolean;
  side: Side;
  targetSize: { w: number; h: number };
  minSize: { w: number; h: number };
}

/** Se a soltura é aceita e, se não, por quê (FR-604). */
export function dropVerdict(input: DropInput): DropVerdict {
  if (input.dragId === input.targetId) return 'self';
  if (input.dragKind === 'sftp' || input.targetKind === 'sftp') return 'sftp';
  if (input.dragKind === 'group') return 'group';
  if (!input.sameGroup && input.targetGroupSize >= MAX_PANES) return 'full';
  const horizontal = input.side === 'left' || input.side === 'right';
  const half = horizontal ? input.targetSize.w / 2 : input.targetSize.h / 2;
  const min = horizontal ? input.minSize.w : input.minSize.h;
  return half < min ? 'tooSmall' : 'ok';
}

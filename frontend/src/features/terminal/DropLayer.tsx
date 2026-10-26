import { useState, type CSSProperties, type DragEvent } from 'react';
import { t } from '../../i18n/pt-BR';
import { groupOf, useSessions } from '../../stores/sessions';
import { endDrag, type Dragging } from './dragState';
import { dropVerdict, leaves, rects, type DropVerdict, type Rect, type Side } from './layout';
import { terminalOf } from './terminalRegistry';
import s from './terminal.module.css';

/** Altura do cabeçalho de painel e o mínimo de células por painel (research R5). */
export const PANE_HEADER = 24;
const MIN_COLS = 20;
const MIN_ROWS = 5;

interface Hover {
  targetId: string;
  side: Side;
  /** Painel de destino em frações da área. */
  rect: Rect;
  verdict: DropVerdict;
}

/** Mínimo em pixels pela célula atual do xterm de destino; sem medida, uma célula típica. */
function minSize(id: string): { w: number; h: number } {
  const term = terminalOf(id)?.term;
  const el = term?.element;
  if (!term || !el || term.cols <= 0 || term.rows <= 0)
    return { w: MIN_COLS * 8, h: MIN_ROWS * 17 + PANE_HEADER };
  return {
    w: (el.clientWidth / term.cols) * MIN_COLS,
    h: (el.clientHeight / term.rows) * MIN_ROWS + PANE_HEADER,
  };
}

/** Borda mais próxima do ponteiro, com o ponto em frações do painel. */
function sideAt(fx: number, fy: number): Side {
  const edges: [Side, number][] = [
    ['left', fx],
    ['right', 1 - fx],
    ['top', fy],
    ['bottom', 1 - fy],
  ];
  return edges.reduce((best, cur) => (cur[1] < best[1] ? cur : best))[0];
}

function half(r: Rect, side: Side): Rect {
  switch (side) {
    case 'left':
      return { ...r, w: r.w / 2 };
    case 'right':
      return { ...r, x: r.x + r.w / 2, w: r.w / 2 };
    case 'top':
      return { ...r, h: r.h / 2 };
    case 'bottom':
      return { ...r, y: r.y + r.h / 2, h: r.h / 2 };
  }
}

const pct = (r: Rect): CSSProperties => ({
  left: `${String(r.x * 100)}%`,
  top: `${String(r.y * 100)}%`,
  width: `${String(r.w * 100)}%`,
  height: `${String(r.h * 100)}%`,
});

const same = (a: Hover | null, b: Hover | null) =>
  a?.targetId === b?.targetId && a?.side === b?.side && a?.verdict === b?.verdict;

/**
 * Zonas de soltura sobre a área dos terminais enquanto uma aba ou um cabeçalho é arrastado
 * (FR-603, FR-604): prévia do lado em que a sessão entra ou o motivo da recusa.
 */
export function DropLayer({ dragging }: { dragging: Dragging }) {
  const [hover, setHover] = useState<Hover | null>(null);

  const locate = (e: DragEvent<HTMLDivElement>): Hover | null => {
    const { tabs, groups, activeId } = useSessions.getState();
    if (!activeId) return null;
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return null;
    const px = (e.clientX - box.left) / box.width;
    const py = (e.clientY - box.top) / box.height;
    const group = groupOf(groups, activeId);
    const panes: Record<string, Rect> = group
      ? rects(group.root).panes
      : { [activeId]: { x: 0, y: 0, w: 1, h: 1 } };
    const hit = Object.entries(panes).find(
      ([, r]) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h,
    );
    const target = hit && tabs.find((tab) => tab.id === hit[0]);
    if (!hit || !target) return null;
    const [targetId, rect] = hit;
    const side = sideAt((px - rect.x) / rect.w, (py - rect.y) / rect.h);
    const members = group ? leaves(group.root) : [targetId];
    const verdict = dropVerdict({
      dragId: dragging.id,
      targetId,
      dragKind: dragging.kind,
      targetKind: target.kind === 'sftp' ? 'sftp' : 'terminal',
      targetGroupSize: members.length,
      sameGroup: members.includes(dragging.id),
      side,
      targetSize: { w: rect.w * box.width, h: rect.h * box.height },
      minSize: minSize(targetId),
    });
    return { targetId, side, rect, verdict };
  };

  return (
    <div
      className={s.dropLayer}
      data-drop-layer
      onDragOver={(e) => {
        e.preventDefault();
        const next = locate(e);
        e.dataTransfer.dropEffect = next?.verdict === 'ok' ? 'move' : 'none';
        setHover((cur) => (same(cur, next) ? cur : next));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const at = locate(e);
        setHover(null);
        endDrag();
        if (at?.verdict === 'ok') useSessions.getState().join(dragging.id, at.targetId, at.side);
      }}
    >
      {hover?.verdict === 'ok' && (
        <div
          className={s.dropPreview}
          data-drop-preview
          data-side={hover.side}
          style={pct(half(hover.rect, hover.side))}
        />
      )}
      {hover && hover.verdict !== 'ok' && hover.verdict !== 'self' && (
        <div className={s.dropRefuse} style={pct(hover.rect)}>
          <span role="status">{t.terminal.group.refuse[hover.verdict]}</span>
        </div>
      )}
    </div>
  );
}

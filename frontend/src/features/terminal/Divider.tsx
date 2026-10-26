import { useRef, useState, type CSSProperties } from 'react';
import { t } from '../../i18n/pt-BR';
import { useSessions } from '../../stores/sessions';
import {
  clampSplit,
  leaves,
  minExtent,
  nodeAt,
  setRatio,
  type DividerRect,
  type LayoutNode,
} from './layout';
import { paneMin } from './paneMin';
import { fitTerminal } from './terminalRegistry';
import s from './terminal.module.css';

/** Passo das setas do teclado (contracts/ui.md). */
const KEY_STEP = 0.05;

const pct = (n: number) => `${String(n * 100)}%`;

/** Proporção limitada para nenhum painel dos dois lados ficar abaixo do mínimo (research R5). */
function limited(root: LayoutNode, d: DividerRect, ratio: number, area: DOMRect): number {
  const node = nodeAt(root, d.path);
  if (!node || node.kind === 'leaf') return ratio;
  const row = d.dir === 'row';
  const cell = Math.max(
    ...leaves(node).map((id) => {
      const min = paneMin(id);
      return row ? min.w : min.h;
    }),
  );
  const total = row ? d.area.w * area.width : d.area.h * area.height;
  return clampSplit(ratio, total, minExtent(node.a, d.dir, cell), minExtent(node.b, d.dir, cell));
}

/**
 * Divisória entre painéis de um grupo (FR-608): arrasto por ponteiro, dois cliques ou Enter
 * igualam, setas mudam 5%. Os terminais se ajustam a cada quadro (FR-609).
 */
export function Divider({ groupId, divider }: { groupId: string; divider: DividerRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const row = divider.dir === 'row';

  const apply = (ratio: number) => {
    const sessions = useSessions.getState();
    const root = sessions.groups[groupId]?.root;
    const area = ref.current?.closest('[data-terminal-area]')?.getBoundingClientRect();
    if (!root || !area) return;
    const next = setRatio(root, divider.path, limited(root, divider, ratio, area));
    sessions.setLayout(groupId, next);
    // Depois do render com o novo tamanho, cada terminal recalcula linhas e colunas.
    requestAnimationFrame(() => {
      for (const id of leaves(next)) fitTerminal(id);
    });
  };

  const style: CSSProperties = row
    ? { left: pct(divider.x), top: pct(divider.y), height: pct(divider.h) }
    : { left: pct(divider.x), top: pct(divider.y), width: pct(divider.w) };

  return (
    <div
      ref={ref}
      className={s.divider}
      style={style}
      role="separator"
      tabIndex={0}
      aria-label={t.terminal.group.resize}
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(divider.ratio * 100)}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        const el = e.currentTarget;
        const area = el.closest('[data-terminal-area]')?.getBoundingClientRect();
        if (!area) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        setDragging(true);
        let frame = 0;
        const move = (ev: PointerEvent) => {
          const at = row
            ? ((ev.clientX - area.left) / area.width - divider.area.x) / divider.area.w
            : ((ev.clientY - area.top) / area.height - divider.area.y) / divider.area.h;
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            apply(at);
          });
        };
        const end = () => {
          setDragging(false);
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', end);
          el.removeEventListener('pointercancel', end);
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
      }}
      onDoubleClick={() => {
        apply(0.5);
      }}
      onKeyDown={(e) => {
        const back = row ? 'ArrowLeft' : 'ArrowUp';
        const forward = row ? 'ArrowRight' : 'ArrowDown';
        if (e.key === 'Enter') apply(0.5);
        else if (e.key === back) apply(divider.ratio - KEY_STEP);
        else if (e.key === forward) apply(divider.ratio + KEY_STEP);
        else return;
        e.preventDefault();
      }}
    />
  );
}

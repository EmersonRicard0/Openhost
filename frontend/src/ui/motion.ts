// Movimento (FR-170): saída animada antes de desmontar e indicador que desliza até o item ativo.
// Durações e curvas vêm dos tokens `--motion-*`/`--ease-*`, zerados com "reduzir movimento".
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
  type RefObject,
} from 'react';

export type Phase = 'closed' | 'open' | 'closing';
type PhaseEvent = 'open' | 'close' | 'animationEnd';

export function nextPhase(phase: Phase, event: PhaseEvent): Phase {
  if (event === 'open') return 'open';
  if (event === 'close') return phase === 'open' ? 'closing' : phase;
  return phase === 'closing' ? 'closed' : phase;
}

/** Folga caso `animationend` não chegue (aba oculta, animação zerada). */
const EXIT_FALLBACK_MS = 400;

/**
 * Mantém o elemento montado enquanto a animação de saída roda. O componente aplica
 * `data-closing` quando `closing` e chama `onAnimationEnd` no `animationend`.
 */
export function useExitAnimation(open: boolean) {
  const [phase, dispatch] = useReducer(nextPhase, open ? 'open' : 'closed');

  useEffect(() => {
    dispatch(open ? 'open' : 'close');
  }, [open]);

  useEffect(() => {
    if (phase !== 'closing') return;
    const timer = setTimeout(() => {
      dispatch('animationEnd');
    }, EXIT_FALLBACK_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [phase]);

  const onAnimationEnd = useCallback(() => {
    dispatch('animationEnd');
  }, []);

  return { mounted: phase !== 'closed', closing: phase === 'closing', onAnimationEnd };
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function indicatorFor(container: Box, item: Box, axis: 'x' | 'y', scroll = 0) {
  return axis === 'x'
    ? { offset: item.left - container.left + scroll, size: item.width }
    : { offset: item.top - container.top + scroll, size: item.height };
}

/**
 * Posição do indicador do item ativo (`[aria-selected="true"]` ou `selector`) dentro do
 * contêiner, como variáveis CSS `--indicator-offset`/`--indicator-size`; a transição fica no CSS.
 */
export function useSlidingIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeKey: unknown,
  axis: 'x' | 'y',
  selector = '[aria-selected="true"]',
) {
  const [style, setStyle] = useState<Record<string, string> | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const item = container.querySelector<HTMLElement>(selector);
      if (!item) {
        setStyle(null);
        return;
      }
      const scroll = axis === 'x' ? container.scrollLeft : container.scrollTop;
      const { offset, size } = indicatorFor(
        container.getBoundingClientRect(),
        item.getBoundingClientRect(),
        axis,
        scroll,
      );
      setStyle({
        '--indicator-offset': `${String(offset)}px`,
        '--indicator-size': `${String(size)}px`,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [containerRef, activeKey, axis, selector]);

  return style;
}

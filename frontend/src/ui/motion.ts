// Movimento (FR-170, specs/015): nível de animação, saída da abertura, saída animada antes de
// desmontar e indicador que desliza até o item ativo. Durações e curvas vêm dos tokens
// `--motion-*`/`--ease-*`; `<html data-motion>` decide quanto se move (global.css).
import type { MotionPreference } from '@shared/model/types';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from 'react';

export type MotionLevel = 'full' | 'reduced' | 'off';

/** Nível efetivo: a escolha do usuário, ou o "reduzir movimento" do sistema com `system`. */
export function resolveMotion(
  preference: MotionPreference | undefined,
  systemReduced: boolean,
): MotionLevel {
  if (preference === 'full' || preference === 'reduced' || preference === 'off') return preference;
  return systemReduced ? 'reduced' : 'full';
}

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

export function currentMotion(): MotionLevel {
  const level = document.documentElement.dataset.motion;
  if (level === 'full' || level === 'reduced' || level === 'off') return level;
  return window.matchMedia(REDUCE_QUERY).matches ? 'off' : 'full';
}

/**
 * Mantém `<html data-motion>` em dia com a preferência e com o sistema. `subscribe` avisa quando a
 * preferência muda; devolve a função que desliga tudo.
 */
export function installMotion(
  read: () => MotionPreference | undefined,
  subscribe: (onChange: () => void) => () => void,
): () => void {
  const query = window.matchMedia(REDUCE_QUERY);
  const apply = () => {
    const level = resolveMotion(read(), query.matches);
    if (document.documentElement.dataset.motion !== level) {
      document.documentElement.dataset.motion = level;
    }
  };
  // Janela oculta ou minimizada: animações pausadas (FR-1520).
  const visibility = () => {
    if (document.hidden) document.documentElement.dataset.hidden = '';
    else delete document.documentElement.dataset.hidden;
  };
  apply();
  visibility();
  query.addEventListener('change', apply);
  document.addEventListener('visibilitychange', visibility);
  const unsubscribe = subscribe(apply);
  return () => {
    query.removeEventListener('change', apply);
    document.removeEventListener('visibilitychange', visibility);
    unsubscribe();
  };
}

/** Teto da saída da abertura (a transição no `index.html` dura 200 ms). */
export const BOOT_EXIT_MS = 300;

interface BootElement {
  dataset: DOMStringMap | Record<string, string | undefined>;
  addEventListener: (type: 'transitionend', fn: () => void) => void;
  remove: () => void;
}

/**
 * Tira a tela de abertura do `index.html` (specs/015, FR-1506): esmaece e sai do DOM. Não bloqueia
 * nada — `#boot` já não recebe cliques ao começar a sair. Chamar mais de uma vez não faz nada.
 */
export function dismissBoot(
  doc: { getElementById: (id: string) => unknown } = document,
  level: MotionLevel = currentMotion(),
): void {
  const boot = doc.getElementById('boot') as BootElement | null;
  if (!boot || boot.dataset.leaving !== undefined) return;
  boot.dataset.leaving = '';
  if (level === 'off') {
    boot.remove();
    return;
  }
  let done = false;
  const remove = () => {
    if (done) return;
    done = true;
    boot.remove();
  };
  boot.addEventListener('transitionend', remove);
  setTimeout(remove, BOOT_EXIT_MS);
}

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
    // O item ativo pode mudar de tamanho sem o contêiner mudar (densidade, fonte, conteúdo).
    const active = container.querySelector<HTMLElement>(selector);
    if (active) observer.observe(active);
    return () => {
      observer.disconnect();
    };
  }, [containerRef, activeKey, axis, selector]);

  return style;
}


/**
 * Saída animada de quem é desmontado pelo pai (`{open && <Dialog/>}`): uma cópia inerte, sem
 * papéis ARIA, fica no lugar do elemento com `data-closing` até a animação terminar.
 */
export function leaveGhost(node: HTMLElement | null): void {
  if (!node?.isConnected || currentMotion() !== 'full') return;
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  const layer =
    style.zIndex !== 'auto' ? style.zIndex : getComputedStyle(node.parentElement ?? node).zIndex;
  const ghost = node.cloneNode(true) as HTMLElement;
  // cloneNode copia o atributo `value`, não o que foi digitado.
  const fields = node.querySelectorAll<HTMLInputElement>('input, textarea');
  ghost.querySelectorAll<HTMLInputElement>('input, textarea').forEach((field, i) => {
    field.value = fields[i]?.value ?? '';
  });
  for (const el of [ghost, ...ghost.querySelectorAll<HTMLElement>('*')]) {
    el.removeAttribute('role');
    el.removeAttribute('aria-modal');
    el.removeAttribute('aria-live');
    el.removeAttribute('id');
  }
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.dataset.closing = '';
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${String(rect.left)}px`,
    top: `${String(rect.top)}px`,
    width: `${String(rect.width)}px`,
    height: `${String(rect.height)}px`,
    margin: '0',
    zIndex: layer,
    pointerEvents: 'none',
  });
  const remove = () => {
    ghost.remove();
  };
  ghost.addEventListener('animationend', (e) => {
    if (e.target === ghost) remove();
  });
  setTimeout(remove, EXIT_FALLBACK_MS);
  document.body.append(ghost);
}

/** Liga `leaveGhost` ao desmontar do componente dono de `ref`. */
export function useExitGhost(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(
    () => () => {
      leaveGhost(ref.current);
    },
    [ref],
  );
}

/** Duração de um token `--motion-*` em ms (0 se ausente ou zerado). */
function motionMs(token: '--motion-fast' | '--motion-base' | '--motion-slow'): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith('ms') ? value : value * 1000;
}

/**
 * Itens que mudam de lugar (aba fechada, reordenada) deslizam até a posição nova em vez de pular
 * (specs/015, FR-1510). Cada item marca `data-flip-id`; `key` muda quando a lista muda. Usa a Web
 * Animations API só com `transform`, e só com animações completas.
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, key: string): void {
  const previous = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const items = container.querySelectorAll<HTMLElement>('[data-flip-id]');
    const next = new Map<string, number>();
    const duration = currentMotion() === 'full' ? motionMs('--motion-base') : 0;
    for (const el of items) {
      const id = el.dataset.flipId ?? '';
      const left = el.offsetLeft;
      next.set(id, left);
      const before = previous.current.get(id);
      if (duration > 0 && before !== undefined && before !== left) {
        el.animate(
          [{ transform: `translateX(${String(before - left)}px)` }, { transform: 'none' }],
          { duration, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
        );
      }
    }
    previous.current = next;
  }, [containerRef, key]);
}

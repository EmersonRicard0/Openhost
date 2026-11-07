import { describe, expect, it, vi } from 'vitest';
import { BOOT_EXIT_MS, dismissBoot, indicatorFor, nextPhase, resolveMotion } from './motion';

describe('ciclo de saída animada (FR-170)', () => {
  it('abre, anima a saída e só desmonta no fim da animação', () => {
    expect(nextPhase('closed', 'open')).toBe('open');
    expect(nextPhase('open', 'close')).toBe('closing');
    expect(nextPhase('closing', 'animationEnd')).toBe('closed');
  });

  it('reabrir durante a saída volta a aberto', () => {
    expect(nextPhase('closing', 'open')).toBe('open');
  });

  it('eventos fora de hora não mudam o estado', () => {
    expect(nextPhase('closed', 'close')).toBe('closed');
    expect(nextPhase('closed', 'animationEnd')).toBe('closed');
    expect(nextPhase('open', 'animationEnd')).toBe('open');
    expect(nextPhase('open', 'open')).toBe('open');
  });
});

describe('indicador deslizante (FR-166)', () => {
  const container = { left: 100, top: 40, width: 600, height: 300 };

  it('mede o item relativo ao contêiner no eixo pedido', () => {
    const item = { left: 180, top: 70, width: 120, height: 32 };
    expect(indicatorFor(container, item, 'x')).toEqual({ offset: 80, size: 120 });
    expect(indicatorFor(container, item, 'y')).toEqual({ offset: 30, size: 32 });
  });

  it('considera a rolagem do contêiner', () => {
    const item = { left: 100, top: 40, width: 600, height: 32 };
    expect(indicatorFor(container, item, 'y', 64)).toEqual({ offset: 64, size: 32 });
  });
});

describe('nível de movimento (specs/015)', () => {
  it('system segue o "reduzir movimento" do sistema', () => {
    expect(resolveMotion('system', false)).toBe('full');
    expect(resolveMotion('system', true)).toBe('reduced');
    expect(resolveMotion(undefined, true)).toBe('reduced');
  });

  it('escolha do usuário vale sobre o sistema', () => {
    for (const reduced of [false, true]) {
      expect(resolveMotion('full', reduced)).toBe('full');
      expect(resolveMotion('reduced', reduced)).toBe('reduced');
      expect(resolveMotion('off', reduced)).toBe('off');
    }
  });
});

function fakeBoot() {
  const listeners: Record<string, () => void> = {};
  const el = {
    dataset: {} as Record<string, string>,
    removed: 0,
    addEventListener(type: string, fn: () => void) {
      listeners[type] = fn;
    },
    remove() {
      this.removed += 1;
    },
  };
  return { el, listeners, doc: { getElementById: (id: string) => (id === 'boot' ? el : null) } };
}

describe('saída da abertura (specs/015)', () => {
  it('marca a saída e remove no fim da transição, uma vez só', () => {
    vi.useFakeTimers();
    const { el, listeners, doc } = fakeBoot();
    dismissBoot(doc, 'full');
    expect(el.dataset.leaving).toBe('');
    listeners.transitionend?.();
    vi.advanceTimersByTime(1_000);
    dismissBoot(doc, 'full');
    expect(el.removed).toBe(1);
    vi.useRealTimers();
  });

  it('remove pelo teto se a transição não terminar', () => {
    vi.useFakeTimers();
    const { el, doc } = fakeBoot();
    dismissBoot(doc, 'full');
    expect(el.removed).toBe(0);
    vi.advanceTimersByTime(BOOT_EXIT_MS);
    expect(el.removed).toBe(1);
    vi.useRealTimers();
  });

  it('desligadas remove na hora; sem abertura não falha', () => {
    const { el, doc } = fakeBoot();
    dismissBoot(doc, 'off');
    expect(el.removed).toBe(1);
    expect(() => {
      dismissBoot({ getElementById: () => null }, 'full');
    }).not.toThrow();
  });
});

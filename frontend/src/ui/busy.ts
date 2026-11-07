// Ações demoradas iniciadas por clique (specs/015, FR-1509): o elemento mostra que começou e o
// mesmo clique repetido é ignorado até a ação terminar ou falhar.
import { useCallback, useMemo, useState } from 'react';

export interface BusyGuard {
  readonly busy: boolean;
  /** Roda `action` se nada estiver pendente; senão devolve `undefined` sem chamar. */
  run<T>(action: () => Promise<T>): Promise<T> | undefined;
}

export function createBusyGuard(onChange: (busy: boolean) => void): BusyGuard {
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    run(action) {
      if (busy) return undefined;
      busy = true;
      onChange(true);
      const done = () => {
        busy = false;
        onChange(false);
      };
      return action().then(
        (value) => {
          done();
          return value;
        },
        (error: unknown) => {
          done();
          throw error;
        },
      );
    },
  };
}

/** Atributos para o elemento da ação: `data-busy` e `aria-busy` enquanto pendente. */
export function busyProps(busy: boolean) {
  return busy ? { 'data-busy': '', 'aria-busy': true as const } : {};
}

/**
 * `run` dispara a ação uma vez por vez (a trava é síncrona, sem esperar o React); `busy` vale
 * para o visual.
 */
export function useBusyAction<A extends unknown[]>(action: (...args: A) => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const guard = useMemo(() => createBusyGuard(setBusy), []);
  const run = useCallback(
    (...args: A) => {
      void guard.run(() => action(...args))?.catch(() => undefined);
    },
    [guard, action],
  );
  return [run, busy] as const;
}

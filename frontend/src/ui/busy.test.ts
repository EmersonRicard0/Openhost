import { describe, expect, it } from 'vitest';
import { createBusyGuard } from './busy';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('trava de ação demorada (specs/015, FR-1509)', () => {
  it('ignora a mesma ação enquanto a primeira não termina', async () => {
    const states: boolean[] = [];
    const guard = createBusyGuard((busy) => states.push(busy));
    const first = deferred();
    let calls = 0;
    const action = () => {
      calls += 1;
      return first.promise;
    };
    const a = guard.run(action);
    const b = guard.run(action);
    expect(calls).toBe(1);
    expect(b).toBeUndefined();
    expect(guard.busy).toBe(true);
    first.resolve();
    await a;
    expect(guard.busy).toBe(false);
    expect(states).toEqual([true, false]);
    void guard.run(() => Promise.resolve());
    expect(calls).toBe(1);
  });

  it('libera e repassa o erro quando a ação falha', async () => {
    const guard = createBusyGuard(() => undefined);
    const failing = deferred();
    const run = guard.run(() => failing.promise);
    failing.reject(new Error('falhou'));
    await expect(run).rejects.toThrow('falhou');
    expect(guard.busy).toBe(false);
  });
});

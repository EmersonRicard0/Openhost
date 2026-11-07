import { afterEach, describe, expect, it } from 'vitest';
import { drop, send, setWriteForTests } from './writer';

interface Call {
  id: string;
  data: string;
  done: () => void;
}

function fakeBridge() {
  const calls: Call[] = [];
  setWriteForTests(
    (id, data) =>
      new Promise<void>((resolve) => {
        calls.push({ id, data, done: resolve });
      }),
  );
  return calls;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('fila de escrita por sessão (012, R1)', () => {
  afterEach(() => {
    drop('a');
    drop('b');
  });

  it('uma escrita por vez; o que chega durante a escrita vai junto na próxima', async () => {
    const calls = fakeBridge();
    send('a', 'e');
    send('a', 'c');
    send('a', 'ho');
    expect(calls.map((c) => c.data)).toEqual(['e']);
    calls[0]?.done();
    await tick();
    expect(calls.map((c) => c.data)).toEqual(['e', 'cho']);
  });

  it('filas independentes: uma sessão lenta não segura a outra', () => {
    const calls = fakeBridge();
    send('a', 'x');
    send('a', 'y');
    send('b', 'z');
    expect(calls.map((c) => `${c.id}:${c.data}`)).toEqual(['a:x', 'b:z']);
  });

  it('texto vazio não escreve; sessão esquecida descarta o que sobrou', async () => {
    const calls = fakeBridge();
    send('a', '');
    expect(calls).toHaveLength(0);
    send('a', '1');
    send('a', '2');
    drop('a');
    calls[0]?.done();
    await tick();
    expect(calls.map((c) => c.data)).toEqual(['1']);
  });
});

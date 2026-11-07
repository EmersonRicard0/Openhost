// Escrita no terminal remoto (specs/012, research R1): uma fila por sessão. O Wails atende cada
// chamada numa goroutine e teclas rápidas chegariam fora de ordem; o que chega durante uma escrita
// vai junto na próxima. Digitação, transmissão do grupo e comandos salvos passam todos por aqui.

type Write = (sessionId: string, data: string) => Promise<unknown>;

interface Queue {
  pending: string;
  writing: boolean;
}

const queues = new Map<string, Queue>();
let write: Write = (sessionId, data) => window.shellvault.sessions.write(sessionId, data);

/** Só para testes: troca a escrita da ponte. */
export function setWriteForTests(fn: Write): void {
  write = fn;
}

function flush(sessionId: string, queue: Queue): void {
  if (queue.writing || !queue.pending) return;
  const data = queue.pending;
  queue.pending = '';
  queue.writing = true;
  void write(sessionId, data)
    .catch(() => undefined)
    .finally(() => {
      queue.writing = false;
      // Sessão fechada durante a escrita: o que sobrou é descartado.
      if (queues.get(sessionId) === queue) flush(sessionId, queue);
    });
}

export function send(sessionId: string, data: string): void {
  if (!data) return;
  let queue = queues.get(sessionId);
  if (!queue) {
    queue = { pending: '', writing: false };
    queues.set(sessionId, queue);
  }
  queue.pending += data;
  flush(sessionId, queue);
}

/** Esquece a fila da sessão (aba fechada). */
export function drop(sessionId: string): void {
  queues.delete(sessionId);
}

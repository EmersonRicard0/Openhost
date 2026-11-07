// Distribui a saída das sessões para os terminais e guarda o que chega antes da aba montar.
// O que fica guardado tem teto por sessão e some quando a sessão fecha (specs/014, R3).
type Sink = (data: string) => void;

/** Teto do que fica guardado por sessão sem terminal montado. */
export const BACKLOG_LIMIT = 1024 * 1024;
/** Quantos ids de sessões fechadas lembrar (para ignorar saída que chega atrasada). */
const CLOSED_MEMORY = 512;

interface Backlog {
  chunks: string[];
  size: number;
}

const sinks = new Map<string, Sink>();
const backlog = new Map<string, Backlog>();
const closed = new Set<string>();
let subscribed = false;

function keep(sessionId: string, data: string): void {
  if (closed.has(sessionId)) return;
  let entry = backlog.get(sessionId);
  if (!entry) {
    entry = { chunks: [], size: 0 };
    backlog.set(sessionId, entry);
  }
  entry.chunks.push(data);
  entry.size += data.length;
  while (entry.size > BACKLOG_LIMIT && entry.chunks.length > 1) {
    const oldest = entry.chunks.shift();
    entry.size -= oldest?.length ?? 0;
  }
}

export function subscribeData(): void {
  if (subscribed) return;
  subscribed = true;
  const api = window.shellvault.sessions;
  api.onData(({ sessionId, data }) => {
    const sink = sinks.get(sessionId);
    if (sink) sink(data);
    else keep(sessionId, data);
  });
  api.onClosed(({ sessionId }) => {
    forget(sessionId);
  });
}

export function attach(sessionId: string, sink: Sink): () => void {
  sinks.set(sessionId, sink);
  const pending = backlog.get(sessionId);
  if (pending) {
    backlog.delete(sessionId);
    for (const chunk of pending.chunks) sink(chunk);
  }
  return () => {
    if (sinks.get(sessionId) === sink) sinks.delete(sessionId);
  };
}

/** Sessão fechada: solta tudo e ignora o que ainda chegar dela. */
export function forget(sessionId: string): void {
  sinks.delete(sessionId);
  backlog.delete(sessionId);
  closed.add(sessionId);
  if (closed.size > CLOSED_MEMORY) {
    const oldest = closed.values().next().value;
    if (oldest !== undefined) closed.delete(oldest);
  }
}

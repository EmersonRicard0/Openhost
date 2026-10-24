// Distribui a saída das sessões para os terminais; guarda o que chega antes da aba montar.
import type { TermSize } from '@shared/model/types';

type Sink = (data: string) => void;

const sinks = new Map<string, Sink>();
const backlog = new Map<string, string[]>();
let subscribed = false;
let lastSize: TermSize | null = null;

export function subscribeData(): void {
  if (subscribed) return;
  subscribed = true;
  window.shellvault.sessions.onData(({ sessionId, data }) => {
    const sink = sinks.get(sessionId);
    if (sink) sink(data);
    else backlog.set(sessionId, [...(backlog.get(sessionId) ?? []), data]);
  });
}

export function attach(sessionId: string, sink: Sink): () => void {
  sinks.set(sessionId, sink);
  const pending = backlog.get(sessionId);
  if (pending) {
    backlog.delete(sessionId);
    for (const chunk of pending) sink(chunk);
  }
  return () => {
    if (sinks.get(sessionId) === sink) sinks.delete(sessionId);
  };
}

export function forget(sessionId: string): void {
  sinks.delete(sessionId);
  backlog.delete(sessionId);
}

export function rememberSize(size: TermSize): void {
  lastSize = size;
}

/** Tamanho para abrir uma sessão nova; o `fit` da aba corrige logo em seguida. */
export function initialSize(fontSize: number): TermSize {
  if (lastSize) return lastSize;
  const area = document.querySelector('[data-terminal-area]')?.getBoundingClientRect();
  if (!area || area.width === 0) return { cols: 80, rows: 24 };
  return {
    cols: Math.max(20, Math.floor((area.width - 16) / (fontSize * 0.6))),
    rows: Math.max(5, Math.floor((area.height - 8) / (fontSize * 1.2))),
  };
}

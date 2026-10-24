// Permite que diálogos de uma sessão (host key, prompts) devolvam o foco ao terminal dela (B3).
const focusers = new Map<string, () => void>();

export function registerTerminalFocus(sessionId: string, focus: () => void): () => void {
  focusers.set(sessionId, focus);
  return () => {
    if (focusers.get(sessionId) === focus) focusers.delete(sessionId);
  };
}

export function focusTerminal(sessionId: string): void {
  focusers.get(sessionId)?.();
}

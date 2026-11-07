// Painel que acabou de entrar num grupo (specs/015, FR-1511): só ele anima a entrada. Trocar para
// uma aba que já é grupo não passa por aqui, então não anima (FR-1513).
const entering = new Set<string>();

export function markPaneEntering(sessionId: string): void {
  entering.add(sessionId);
}

/** Verdadeiro uma única vez depois de `markPaneEntering`. */
export function takePaneEntering(sessionId: string): boolean {
  return entering.delete(sessionId);
}

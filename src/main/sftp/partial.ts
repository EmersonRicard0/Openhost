// Regras puras de transferência: nome do parcial, estados e escolhas de conflito (FR-021).
import type { ConflictChoice, TransferState } from '@shared/model/types';

const PARTIAL = /\.svpart-[0-9a-f]{8}$/;

/** Arquivo gravado durante a transferência; renomeado só ao concluir. */
export function partialName(name: string, transferId: string): string {
  return `${name}.svpart-${transferId.slice(0, 8)}`;
}

export function isPartialName(name: string): boolean {
  return PARTIAL.test(name);
}

const NEXT: Record<TransferState, readonly TransferState[]> = {
  queued: ['running', 'cancelled', 'skipped', 'failed'],
  running: ['completed', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
  skipped: [],
};

export function canTransition(from: TransferState, to: TransferState): boolean {
  return NEXT[from].includes(to);
}

export function isFinal(state: TransferState): boolean {
  return NEXT[state].length === 0;
}

/**
 * Estados a aplicar após a escolha do usuário: `skip` pula o arquivo; `cancelAll` cancela
 * o arquivo e os ainda na fila da mesma operação; `replace` segue normalmente.
 */
export function planConflictChoice(
  batch: readonly { id: string; state: TransferState }[],
  transferId: string,
  choice: ConflictChoice,
): Map<string, TransferState> {
  const plan = new Map<string, TransferState>();
  if (choice === 'skip') plan.set(transferId, 'skipped');
  if (choice === 'cancelAll') {
    for (const item of batch) {
      if (item.id === transferId || item.state === 'queued') plan.set(item.id, 'cancelled');
    }
  }
  return plan;
}

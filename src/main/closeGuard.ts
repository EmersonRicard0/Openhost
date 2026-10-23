import type { ActiveSummary } from '@shared/model/types';

export interface CloseGuardDeps {
  summary: () => ActiveSummary;
  /** Pede ao renderer a confirmação, com as contagens. */
  request: (summary: ActiveSummary) => void;
  /** Fecha a janela de fato. */
  close: () => void;
}

/** Fechar com sessões, transferências ou encaminhamentos ativos exige confirmação (FR-028). */
export class CloseGuard {
  private confirmed = false;

  constructor(private readonly deps: CloseGuardDeps) {}

  summary(): ActiveSummary {
    return this.deps.summary();
  }

  /** Chamado no `close` da janela: true quando o fechamento deve ser impedido. */
  intercept(): boolean {
    if (this.confirmed) return false;
    const summary = this.deps.summary();
    if (summary.sessions + summary.transfers + summary.forwards === 0) return false;
    this.deps.request(summary);
    return true;
  }

  confirm(confirmed: boolean): void {
    if (!confirmed) return;
    this.confirmed = true;
    this.deps.close();
  }
}

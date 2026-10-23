import { describe, expect, it, vi } from 'vitest';
import type { ActiveSummary } from '@shared/model/types';
import { CloseGuard } from '../../../src/main/closeGuard';

const idle: ActiveSummary = { sessions: 0, transfers: 0, forwards: 0 };

function guard(summary: ActiveSummary) {
  const request = vi.fn();
  const close = vi.fn();
  return { g: new CloseGuard({ summary: () => summary, request, close }), request, close };
}

describe('CloseGuard (FR-028)', () => {
  it('sem nada em andamento deixa fechar direto', () => {
    const { g, request } = guard(idle);
    expect(g.intercept()).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it.each<[string, ActiveSummary]>([
    ['sessão', { ...idle, sessions: 1 }],
    ['transferência', { ...idle, transfers: 2 }],
    ['encaminhamento', { ...idle, forwards: 1 }],
  ])('com %s ativa segura o fechamento e pede confirmação', (_name, summary) => {
    const { g, request, close } = guard(summary);
    expect(g.intercept()).toBe(true);
    expect(request).toHaveBeenCalledWith(summary);
    expect(close).not.toHaveBeenCalled();
  });

  it('cancelar mantém a janela; confirmar fecha e não pergunta de novo', () => {
    const { g, close } = guard({ ...idle, sessions: 3 });
    g.intercept();
    g.confirm(false);
    expect(close).not.toHaveBeenCalled();
    expect(g.intercept()).toBe(true);

    g.confirm(true);
    expect(close).toHaveBeenCalledOnce();
    expect(g.intercept()).toBe(false);
  });
});

// Perguntas pendentes ao usuário (host key, prompts) por sessão.
import type { HostKeyEvent, PromptEvent } from '@shared/model/types';
import type { HostKeyPromptInfo, UserPrompt } from './connection';

export interface InteractionEvents {
  hostKey(event: HostKeyEvent): void;
  prompt(event: PromptEvent): void;
}

export class Interactions {
  private readonly hostKeys = new Map<string, (accept: boolean) => void>();
  private readonly prompts = new Map<string, (answers: string[] | null) => void>();

  constructor(private readonly events: InteractionEvents) {}

  askHostKey(sessionId: string, info: HostKeyPromptInfo): Promise<boolean> {
    this.hostKeys.get(sessionId)?.(false);
    return new Promise((resolve) => {
      this.hostKeys.set(sessionId, resolve);
      this.events.hostKey({ sessionId, ...info });
    });
  }

  answerHostKey(sessionId: string, accept: boolean): void {
    const resolve = this.hostKeys.get(sessionId);
    this.hostKeys.delete(sessionId);
    resolve?.(accept);
  }

  askPrompt(sessionId: string, prompt: UserPrompt): Promise<string[] | null> {
    this.prompts.get(sessionId)?.(null);
    return new Promise((resolve) => {
      this.prompts.set(sessionId, resolve);
      this.events.prompt({ sessionId, ...prompt });
    });
  }

  answerPrompt(sessionId: string, answers: string[] | null): void {
    const resolve = this.prompts.get(sessionId);
    this.prompts.delete(sessionId);
    resolve?.(answers);
  }

  /** Recusa tudo que estiver pendente (aba fechada). */
  cancel(sessionId: string): void {
    this.answerHostKey(sessionId, false);
    this.answerPrompt(sessionId, null);
  }
}

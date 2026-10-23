import type { IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import {
  channelOf,
  type ApiModule,
  type EventPayload,
  type InvokeArgs,
  type InvokeValue,
  type ShellVaultApi,
} from '@shared/ipc/api';
import type { Result } from '@shared/ipc/result';
import { appError, toAppError } from './messages';

/** Subconjunto de `ipcMain` usado aqui (permite testar sem Electron). */
export interface IpcLike {
  handle(
    channel: string,
    listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ): void;
}

export interface RegistrarDeps {
  ipc: IpcLike;
  /** Confere que a chamada veio do frame principal da janela do app. */
  isTrustedSender(event: unknown): boolean;
  isUnlocked(): boolean;
}

export interface HandleOptions {
  /** Funções 🔒 do contrato. */
  requiresUnlocked?: boolean;
}

export interface Registrar {
  handle<M extends ApiModule, K extends keyof ShellVaultApi[M]>(
    module: M,
    name: K,
    schema: z.ZodType<InvokeArgs<M, K>>,
    fn: (...args: InvokeArgs<M, K>) => InvokeValue<M, K> | Promise<InvokeValue<M, K>>,
    options?: HandleOptions,
  ): void;
}

export function createRegistrar(deps: RegistrarDeps): Registrar {
  const registered = new Set<string>();
  return {
    handle(module, name, schema, fn, options = {}) {
      const channel = channelOf(module, name);
      if (registered.has(channel)) throw new Error(`Canal IPC duplicado: ${channel}`);
      registered.add(channel);
      deps.ipc.handle(channel, async (event, ...args): Promise<Result<unknown>> => {
        if (!deps.isTrustedSender(event)) return { ok: false, error: appError('INVALID_INPUT') };
        const parsed = schema.safeParse(args);
        if (!parsed.success) return { ok: false, error: appError('INVALID_INPUT') };
        if (options.requiresUnlocked && !deps.isUnlocked()) {
          return { ok: false, error: appError('VAULT_LOCKED') };
        }
        try {
          return { ok: true, value: await fn(...parsed.data) };
        } catch (e) {
          return { ok: false, error: toAppError(e) };
        }
      });
    },
  };
}

export interface Emitter {
  emit<M extends ApiModule, K extends keyof ShellVaultApi[M]>(
    module: M,
    name: K,
    payload: EventPayload<M, K>,
  ): void;
}

/** Envia eventos para a janela principal (se aberta). */
export function createEmitter(send: (channel: string, payload: unknown) => void): Emitter {
  return {
    emit(module, name, payload) {
      send(channelOf(module, name), payload);
    },
  };
}

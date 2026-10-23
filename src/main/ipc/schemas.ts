// Schemas zod reutilizados pelos handlers da ponte.
import { z } from 'zod';
import type { Patch } from '@shared/ipc/api';

export const id = z.uuid();

export const termSize = z.object({
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
});

/** Texto digitado no terminal: limite generoso para colagens grandes. */
export const terminalInput = z.string().max(1024 * 1024);

/** Remove campos `undefined` de um patch validado, para não sobrescrever valores existentes. */
export function definedOnly<T extends object>(patch: Patch<T>): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

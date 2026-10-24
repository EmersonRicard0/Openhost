import { describe, expect, it } from 'vitest';
import { toAppError } from './index';

describe('toAppError', () => {
  it('lê o JSON do erro Go', () => {
    expect(toAppError('{"code":"AUTH_FAILED","message":"A autenticação falhou."}')).toEqual({
      code: 'AUTH_FAILED',
      message: 'A autenticação falhou.',
    });
  });

  it('aceita Error com a mensagem em JSON', () => {
    expect(toAppError(new Error('{"code":"VAULT_LOCKED","message":"bloqueado"}')).code).toBe(
      'VAULT_LOCKED',
    );
  });

  it('não repassa texto fora do contrato', () => {
    const e = toAppError('dial tcp 10.0.0.1:22: senha=segredo');
    expect(e.code).toBe('INTERNAL');
    expect(e.message).not.toContain('segredo');
  });

  it('rejeita código desconhecido', () => {
    expect(toAppError('{"code":"OUTRO","message":"x"}').code).toBe('INTERNAL');
  });
});

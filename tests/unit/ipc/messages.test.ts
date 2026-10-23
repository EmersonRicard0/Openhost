import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/shared/ipc/errors';
import { AppFailure, MESSAGES, fail, toAppError } from '../../../src/main/ipc/messages';

function sysError(code: string): Error {
  return Object.assign(new Error(`connect ${code} 10.0.0.1:22`), { code });
}

describe('toAppError', () => {
  it('tem mensagem pt-BR para todo código', () => {
    for (const code of ERROR_CODES) expect(MESSAGES[code].length).toBeGreaterThan(0);
  });

  it.each([
    ['ECONNREFUSED', 'CONNECT_REFUSED'],
    ['ENOTFOUND', 'HOST_UNREACHABLE'],
    ['EHOSTUNREACH', 'HOST_UNREACHABLE'],
    ['ENETUNREACH', 'HOST_UNREACHABLE'],
    ['ETIMEDOUT', 'CONNECT_TIMEOUT'],
    ['EADDRINUSE', 'PORT_IN_USE'],
    ['EACCES', 'PERMISSION_DENIED'],
  ])('mapeia %s para %s', (sys, code) => {
    expect(toAppError(sysError(sys)).code).toBe(code);
  });

  it('mapeia erros do ssh2 por nível', () => {
    const auth = Object.assign(new Error('All configured authentication methods failed'), {
      level: 'client-authentication',
    });
    const timeout = Object.assign(new Error('Timed out while waiting for handshake'), {
      level: 'client-timeout',
    });
    expect(toAppError(auth).code).toBe('AUTH_FAILED');
    expect(toAppError(timeout).code).toBe('CONNECT_TIMEOUT');
  });

  it('preserva AppFailure lançada pelo domínio', () => {
    expect(toAppError(fail('WEAK_PASSWORD')).code).toBe('WEAK_PASSWORD');
    expect(fail('WEAK_PASSWORD')).toBeInstanceOf(AppFailure);
  });

  it('mapeia status SFTP numéricos do ssh2', () => {
    const status = (code: number) => Object.assign(new Error('x'), { code });
    expect(toAppError(status(2)).code).toBe('NOT_FOUND');
    expect(toAppError(status(3)).code).toBe('PERMISSION_DENIED');
    expect(toAppError(status(4)).code).toBe('SFTP_ERROR');
  });

  it('retorna INTERNAL para erros desconhecidos', () => {
    expect(toAppError(new Error('boom')).code).toBe('INTERNAL');
    expect(toAppError('texto').code).toBe('INTERNAL');
    expect(toAppError(undefined).code).toBe('INTERNAL');
  });

  it('nunca copia a mensagem original nem o stack', () => {
    const e = new Error('senha=s3cr3t');
    const out = toAppError(e);
    expect(out.message).not.toContain('s3cr3t');
    expect(JSON.stringify(out)).not.toContain('s3cr3t');
    expect(JSON.stringify(out)).not.toContain('at ');
  });
});

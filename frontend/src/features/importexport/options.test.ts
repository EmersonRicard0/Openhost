import { describe, expect, it } from 'vitest';
import type { Group, PreviewKey, PreviewRow } from '@shared/model/types';
import { groupOptions, keyText, parsePort, passwordStrength, ROOT, warningText } from './options';

const g = (id: string, name: string, parentId: string | null = null): Group => ({
  id,
  name,
  parentId,
  sortOrder: 0,
});

describe('groupOptions', () => {
  it('põe a raiz primeiro e os grupos pelo caminho', () => {
    const out = groupOptions([g('2', 'Norte', '1'), g('1', 'Clientes'), g('3', 'Acesso')], 'Raiz');
    expect(out).toEqual([
      { value: ROOT, label: 'Raiz' },
      { value: '3', label: 'Acesso' },
      { value: '1', label: 'Clientes' },
      { value: '2', label: 'Clientes / Norte' },
    ]);
  });
});

describe('textos da prévia', () => {
  it('avisos com nome e linha', () => {
    expect(warningText({ code: 'OPTION_IGNORED', name: 'ProxyJump' })).toBe(
      'ProxyJump não é importado',
    );
    expect(warningText({ code: 'LINE_UNREADABLE', line: 7 })).toBe('Linha 7 não pôde ser lida');
    expect(warningText({ code: 'INVALID_PORT' })).toBe('Porta inválida (1–65535)');
  });

  it('coluna da chave', () => {
    const key: PreviewKey = {
      ref: 'k',
      name: 'id_ed25519',
      path: 'C:/k',
      status: 'ready',
      fingerprint: null,
      usedBy: 1,
    };
    const keys = new Map([['k', key]]);
    const row = { keyRef: 'k' } as PreviewRow;
    expect(keyText(row, keys)).toBe('id_ed25519');
    expect(keyText(row, new Map([['k', { ...key, status: 'notFound' as const }]]))).toBe(
      'id_ed25519 · não encontrada',
    );
    expect(keyText({ keyRef: null } as PreviewRow, keys)).toBe('senha');
  });

  it('porta digitada', () => {
    expect(parsePort('2222')).toBe(2222);
    expect(parsePort(' 22 ')).toBe(22);
    expect(parsePort('0')).toBeNull();
    expect(parsePort('99999')).toBeNull();
    expect(parsePort('22a')).toBeNull();
  });
});

describe('passwordStrength', () => {
  it('é zero abaixo do mínimo, contando caracteres e não bytes', () => {
    expect(passwordStrength('abc', 8)).toBe(0);
    expect(passwordStrength('çãõéíóúâ', 8)).toBe(1);
  });

  it('sobe com comprimento e variedade', () => {
    expect(passwordStrength('abcdefgh', 8)).toBe(1);
    expect(passwordStrength('abcdefghijkl', 8)).toBe(2);
    expect(passwordStrength('Abcdefgh1', 8)).toBe(2);
    expect(passwordStrength('Abcdefgh1!xy', 8)).toBe(3);
    expect(passwordStrength('Abcdefgh1!xyz-longa', 8)).toBe(4);
  });
});

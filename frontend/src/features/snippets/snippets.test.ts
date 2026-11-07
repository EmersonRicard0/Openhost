import { describe, expect, it } from 'vitest';
import type { Snippet } from '@shared/model/types';
import { fieldError, fill, parseFields } from './fields';
import { rankSnippets } from './rank';
import { snippetPayload } from './send';

// Mesma tabela usada pelos testes do Go (R8).
import casesJson from '../../../../internal/domain/testdata/snippet_fields.json';

const cases = casesJson as { text: string; fields: string[] }[];

describe('envio do comando (R9)', () => {
  it('uma linha sem executar não aperta Enter', () => {
    expect(snippetPayload('show version', false)).toBe('show version');
  });
  it('executar acrescenta Enter no fim', () => {
    expect(snippetPayload('show version', true)).toBe('show version\r');
  });
  it('várias linhas: cada uma com Enter, a última só se executar', () => {
    expect(snippetPayload('a\nb\nc', false)).toBe('a\rb\rc');
    expect(snippetPayload('a\r\nb\nc', true)).toBe('a\rb\rc\r');
  });
});

describe('campos {nome} (R8, mesma tabela do Go)', () => {
  for (const c of cases)
    it(JSON.stringify(c.text), () => {
      expect(parseFields(c.text)).toEqual(c.fields);
    });

  it('fill troca cada campo e desfaz {{ }}', () => {
    expect(fill('echo {{x}} {a}-{a} {b}', { a: '1', b: '2' })).toBe('echo {x} 1-1 2');
    expect(fill('echo {open {bad name} {}', {})).toBe('echo {open {bad name} {}');
  });

  it('valida vazio, quebra de linha e tamanho', () => {
    expect(fieldError('vlan', '')).toBe('Preencha o campo vlan');
    expect(fieldError('vlan', '  ')).toBe('Preencha o campo vlan');
    expect(fieldError('vlan', '1\n2')).toBe('O campo vlan não pode ter quebra de linha');
    expect(fieldError('vlan', 'x'.repeat(1001))).not.toBeNull();
    expect(fieldError('vlan', '100')).toBeNull();
  });
});

const snip = (name: string, tags: string[] = [], text = name): Snippet => ({
  id: name,
  name,
  text,
  tags,
  execute: false,
  createdAt: '',
  updatedAt: '',
});

describe('ordem dos comandos (R5 da spec, US5)', () => {
  const list = [snip('Mk', ['mikrotik']), snip('Geral'), snip('Hw', ['huawei']), snip('Ab')];

  it('sem busca: tag em comum, depois sem tag; outras tags somem', () => {
    expect(rankSnippets(list, ['huawei'], '').map((x) => x.name)).toEqual(['Hw', 'Ab', 'Geral']);
  });
  it('com busca: todas entram, sem acento nem caixa, pelo nome ou texto', () => {
    expect(rankSnippets(list, ['huawei'], 'mk').map((x) => x.name)).toEqual(['Mk']);
    const acc = [snip('Configuração', [], 'display current-configuration')];
    expect(rankSnippets(acc, [], 'CONFIGURACAO')).toHaveLength(1);
    expect(rankSnippets(acc, [], 'current')).toHaveLength(1);
  });
  it('500 comandos em menos de 100 ms', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      snip(`cmd-${String(i)}`, i % 3 ? ['huawei'] : [], `display thing ${String(i)}`),
    );
    const t0 = performance.now();
    rankSnippets(many, ['huawei'], 'thing 4');
    rankSnippets(many, ['huawei'], '');
    expect(performance.now() - t0).toBeLessThan(100);
  });
});

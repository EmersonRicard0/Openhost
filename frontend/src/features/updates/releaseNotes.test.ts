import { describe, expect, it } from 'vitest';
import { parseNotes } from './releaseNotes';

describe('notas da versão (specs/007, FR-706)', () => {
  it('títulos, listas com continuação e parágrafos viram texto puro', () => {
    const md = [
      'Terminais **lado a lado**.',
      '',
      '## Novidades',
      '',
      '- Arraste uma aba sobre o terminal',
      '  de outra.',
      '- Veja [as notas](https://exemplo) com `Ctrl+Alt`.',
      '',
      '| Sistema | Arquivo |',
      '|---|---|',
      '```sh',
      'sudo apt install ./x.deb',
      '```',
    ].join('\n');
    expect(parseNotes(md)).toEqual([
      { kind: 'paragraph', text: 'Terminais lado a lado.' },
      { kind: 'heading', text: 'Novidades' },
      {
        kind: 'list',
        items: ['Arraste uma aba sobre o terminal de outra.', 'Veja as notas com Ctrl+Alt.'],
      },
    ]);
  });

  it('HTML na nota fica como texto (não é interpretado)', () => {
    expect(parseNotes('<img src=x onerror=alert(1)>')).toEqual([
      { kind: 'paragraph', text: '<img src=x onerror=alert(1)>' },
    ]);
  });
});

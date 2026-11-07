import { describe, expect, it } from 'vitest';
import { createWebglPool } from './webglPool';

function setup(keepHidden = 1) {
  const log: string[] = [];
  const pool = createWebglPool<string>({
    keepHidden,
    release: (id, handle) => log.push(`release ${id}:${handle}`),
  });
  const attach = (id: string) => () => {
    log.push(`attach ${id}`);
    return `gl-${id}`;
  };
  return { pool, log, attach };
}

describe('pool de WebGL dos terminais (014, R2)', () => {
  it('cria ao aparecer e não recria se já tem', () => {
    const { pool, log, attach } = setup();
    pool.setVisible('a', true, attach('a'));
    pool.setVisible('a', true, attach('a'));
    expect(log).toEqual(['attach a']);
    expect(pool.size()).toBe(1);
  });

  it('guarda só 1 recém-escondido; os mais antigos são liberados', () => {
    const { pool, log, attach } = setup();
    pool.setVisible('a', true, attach('a'));
    pool.setVisible('a', false, attach('a'));
    pool.setVisible('b', true, attach('b'));
    pool.setVisible('b', false, attach('b'));
    // a foi escondida antes de b: sai.
    expect(log).toContain('release a:gl-a');
    expect(log).not.toContain('release b:gl-b');
    pool.setVisible('c', true, attach('c'));
    expect(pool.size()).toBe(2); // c visível + b recém-escondida
  });

  it('voltar para a recém-escondida reaproveita o contexto', () => {
    const { pool, log, attach } = setup();
    pool.setVisible('a', true, attach('a'));
    pool.setVisible('a', false, attach('a'));
    pool.setVisible('a', true, attach('a'));
    expect(log).toEqual(['attach a']);
  });

  it('painéis visíveis nunca são liberados, mesmo com muitos', () => {
    const { pool, log, attach } = setup();
    for (const id of ['a', 'b', 'c', 'd']) pool.setVisible(id, true, attach(id));
    expect(log.filter((l) => l.startsWith('release'))).toEqual([]);
    expect(pool.size()).toBe(4);
  });

  it('remover libera na hora', () => {
    const { pool, log, attach } = setup();
    pool.setVisible('a', true, attach('a'));
    pool.remove('a');
    expect(log).toContain('release a:gl-a');
    expect(pool.size()).toBe(0);
    pool.remove('a'); // idempotente
    expect(log.filter((l) => l.startsWith('release'))).toHaveLength(1);
  });

  it('sem WebGL (attach devolve null) não guarda nada', () => {
    const { pool } = setup();
    pool.setVisible('a', true, () => null);
    expect(pool.size()).toBe(0);
  });

  it('forget tira do pool sem chamar release (contexto já perdido)', () => {
    const { pool, log, attach } = setup();
    pool.setVisible('a', true, attach('a'));
    pool.forget('a');
    expect(pool.size()).toBe(0);
    expect(log.filter((l) => l.startsWith('release'))).toEqual([]);
  });
});

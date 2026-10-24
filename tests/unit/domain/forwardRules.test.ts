import { describe, expect, it } from 'vitest';
import type { ForwardRuleInput } from '../../../frontend/src/shared/model/types';
import {
  createRule,
  listForHost,
  removeRule,
  updateRule,
} from '../../../src/main/domain/forwardRules';
import { createHost } from '../../../src/main/domain/hosts';
import { emptyContent, type VaultContent } from '../../../src/main/vault/content';

const T0 = '2026-10-23T10:00:00.000Z';
const MISSING = '00000000-0000-4000-8000-0000000000ff';

function setup(): { c: VaultContent; hostId: string; otherHostId: string } {
  const c = emptyContent();
  const host = (label: string) =>
    createHost(
      c,
      {
        label,
        address: 'srv.example.com',
        port: 22,
        username: 'u',
        authMethod: 'ask',
        credentialId: null,
        groupId: null,
      },
      T0,
    ).id;
  return { c, hostId: host('a'), otherHostId: host('b') };
}

const input = (hostId: string, overrides: Partial<ForwardRuleInput> = {}): ForwardRuleInput => ({
  hostId,
  label: null,
  bindAddress: '127.0.0.1',
  allowNonLoopback: false,
  bindPort: 15432,
  destHost: 'db.internal',
  destPort: 5432,
  ...overrides,
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

describe('regras de encaminhamento', () => {
  it('cria com endereço local padrão 127.0.0.1 e rótulo opcional', () => {
    const { c, hostId } = setup();
    const rule = createRule(c, input(hostId, { bindAddress: '  ', label: '  ' }));
    expect(rule).toMatchObject({ bindAddress: '127.0.0.1', label: null, bindPort: 15432 });
    expect(rule.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createRule(c, input(hostId, { bindPort: 15433, label: ' banco ' })).label).toBe('banco');
  });

  it('endereço fora do loopback exige allowNonLoopback (FR-025)', () => {
    const { c, hostId } = setup();
    expect(codeOf(() => createRule(c, input(hostId, { bindAddress: '0.0.0.0' })))).toBe(
      'INVALID_INPUT',
    );
    const open = createRule(c, input(hostId, { bindAddress: '0.0.0.0', allowNonLoopback: true }));
    expect(open.bindAddress).toBe('0.0.0.0');
    for (const loopback of ['127.0.0.1', '127.5.5.5', '::1', 'localhost']) {
      expect(
        createRule(
          c,
          input(hostId, { bindAddress: loopback, bindPort: 20000 + c.forwardRules.length }),
        ).bindAddress,
      ).toBe(loopback);
    }
  });

  it.each([
    ['bindPort 0', { bindPort: 0 }],
    ['bindPort 65536', { bindPort: 65536 }],
    ['destPort 0', { destPort: 0 }],
    ['destPort 70000', { destPort: 70000 }],
    ['destHost vazio', { destHost: ' ' }],
    ['destHost inválido', { destHost: 'não é host' }],
    ['bindAddress inválido', { bindAddress: 'abc def', allowNonLoopback: true }],
  ])('rejeita %s', (_, overrides) => {
    const { c, hostId } = setup();
    expect(codeOf(() => createRule(c, input(hostId, overrides)))).toBe('INVALID_INPUT');
  });

  it('bindPort é único entre regras com o mesmo bindAddress', () => {
    const { c, hostId, otherHostId } = setup();
    createRule(c, input(hostId));
    expect(codeOf(() => createRule(c, input(otherHostId)))).toBe('INVALID_INPUT');
    expect(createRule(c, input(otherHostId, { bindAddress: '127.0.0.2' })).bindAddress).toBe(
      '127.0.0.2',
    );
  });

  it('hostId precisa existir', () => {
    const { c } = setup();
    expect(codeOf(() => createRule(c, input(MISSING)))).toBe('INVALID_INPUT');
  });

  it('atualiza mantendo o id e sem conflitar consigo mesma; remove e lista por host', () => {
    const { c, hostId, otherHostId } = setup();
    const a = createRule(c, input(hostId));
    createRule(c, input(otherHostId, { bindPort: 18080 }));
    const updated = updateRule(c, a.id, input(hostId, { destPort: 5433 }));
    expect(updated).toMatchObject({ id: a.id, destPort: 5433 });
    expect(codeOf(() => updateRule(c, a.id, input(hostId, { bindPort: 18080 })))).toBe(
      'INVALID_INPUT',
    );
    expect(listForHost(c, hostId).map((r) => r.id)).toEqual([a.id]);
    removeRule(c, a.id);
    expect(listForHost(c, hostId)).toEqual([]);
    expect(
      codeOf(() => {
        removeRule(c, a.id);
      }),
    ).toBe('NOT_FOUND');
    expect(codeOf(() => updateRule(c, a.id, input(hostId)))).toBe('NOT_FOUND');
  });
});

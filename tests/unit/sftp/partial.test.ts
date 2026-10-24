import { describe, expect, it } from 'vitest';
import type { TransferState } from '../../../frontend/src/shared/model/types';
import {
  canTransition,
  isPartialName,
  partialName,
  planConflictChoice,
} from '../../../src/main/sftp/partial';

const ID = '3f2a9c1e-77aa-4bbb-8ccc-0123456789ab';

describe('arquivo parcial', () => {
  it('usa <nome>.svpart-<id8>', () => {
    expect(partialName('relatório final.pdf', ID)).toBe('relatório final.pdf.svpart-3f2a9c1e');
    expect(isPartialName('a.txt.svpart-3f2a9c1e')).toBe(true);
    expect(isPartialName('a.txt')).toBe(false);
    expect(isPartialName('a.svpart-xyz')).toBe(false);
  });
});

describe('estados da transferência', () => {
  const allowed: [TransferState, TransferState][] = [
    ['queued', 'running'],
    ['queued', 'cancelled'],
    ['queued', 'skipped'],
    ['queued', 'failed'],
    ['running', 'completed'],
    ['running', 'cancelled'],
    ['running', 'failed'],
  ];
  it.each(allowed)('%s → %s é permitido', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each<[TransferState, TransferState]>([
    ['queued', 'completed'],
    ['running', 'queued'],
    ['running', 'skipped'],
    ['completed', 'failed'],
    ['cancelled', 'running'],
    ['skipped', 'running'],
    ['failed', 'completed'],
  ])('%s → %s é recusado', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('plano de conflito', () => {
  const batch = [
    { id: 'a', state: 'completed' as const },
    { id: 'b', state: 'running' as const },
    { id: 'c', state: 'queued' as const },
    { id: 'd', state: 'queued' as const },
  ];

  it('replace segue sem mudar estados', () => {
    expect(planConflictChoice(batch, 'c', 'replace')).toEqual(new Map());
  });

  it('skip pula só o arquivo em conflito', () => {
    expect(planConflictChoice(batch, 'c', 'skip')).toEqual(new Map([['c', 'skipped']]));
  });

  it('cancelAll cancela o arquivo e os restantes ainda na fila da mesma operação', () => {
    expect(planConflictChoice(batch, 'c', 'cancelAll')).toEqual(
      new Map([
        ['c', 'cancelled'],
        ['d', 'cancelled'],
      ]),
    );
  });
});

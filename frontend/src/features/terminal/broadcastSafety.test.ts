import { describe, expect, it } from 'vitest';
import { newlyProduction } from './broadcastSafety';

describe('host que entra em produção (012, FR-1209)', () => {
  it('só os que passaram a prod; quem já era ou saiu não conta', () => {
    const prev = [
      { id: 'a', environmentId: 'lab' },
      { id: 'b', environmentId: 'prod' },
      { id: 'c', environmentId: 'prod' },
    ];
    const next = [
      { id: 'a', environmentId: 'prod' },
      { id: 'b', environmentId: 'prod' },
      { id: 'c', environmentId: null },
      { id: 'd', environmentId: 'prod' },
    ];
    expect([...newlyProduction(prev, next)]).toEqual(['a', 'd']);
  });
});

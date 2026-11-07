import { describe, expect, it } from 'vitest';
import { markPaneEntering, takePaneEntering } from './paneEnter';

describe('entrada do painel (specs/015, FR-1511)', () => {
  it('vale uma vez só, e só para quem entrou', () => {
    markPaneEntering('b');
    expect(takePaneEntering('a')).toBe(false);
    expect(takePaneEntering('b')).toBe(true);
    expect(takePaneEntering('b')).toBe(false);
  });
});

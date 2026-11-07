import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostView } from '@shared/model/types';
import { useSessions } from '../../stores/sessions';
import { connectHost, isConnectPending } from './connect';

const host = { id: 'h1', label: 'web' } as HostView;

describe('conectar uma vez por pedido (specs/015, FR-1509)', () => {
  let resolve: (v: { ok: false; error: unknown }) => void;
  const openSsh = vi.fn(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );

  beforeEach(() => {
    openSsh.mockClear();
    (globalThis as unknown as { window: unknown }).window = {
      shellvault: { sessions: { openSsh } },
    };
  });

  it('ignora o mesmo host enquanto o primeiro pedido não volta', async () => {
    const first = connectHost(host);
    void connectHost(host);
    expect(openSsh).toHaveBeenCalledTimes(1);
    expect(isConnectPending('host:h1')).toBe(true);
    resolve({ ok: false, error: { code: 'x', message: 'x' } });
    await first.catch(() => undefined);
    expect(isConnectPending('host:h1')).toBe(false);
  });

  it('com a sessão do host ainda conectando, só ativa a aba', async () => {
    useSessions.setState({
      tabs: [
        {
          id: 's1',
          kind: 'ssh',
          title: 'web',
          hostId: 'h1',
          shell: null,
          state: 'connecting',
        } as never,
      ],
      activeId: null,
    });
    await connectHost(host);
    expect(openSsh).not.toHaveBeenCalled();
    expect(useSessions.getState().activeId).toBe('s1');
  });
});

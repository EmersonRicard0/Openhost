import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MainContext } from '../context';
import { LocalPtySession } from '../local/ptySession';
import { SshTerminalSession } from '../ssh/terminalSession';
import { fail } from './messages';
import { id, termSize, terminalInput } from './schemas';

const answers = z.array(z.string().max(4096)).max(20).nullable();

export function registerSessionHandlers(ctx: MainContext): void {
  const { reg, sessions, interactions, vault } = ctx;

  reg.handle(
    'sessions',
    'openSsh',
    z.tuple([id, termSize]),
    (hostId, size) => {
      const session = new SshTerminalSession(randomUUID(), hostId, size, {
        registry: sessions,
        vault,
        interactions,
      });
      sessions.add(session);
      // Conecta depois da resposta, para a aba existir antes dos primeiros eventos.
      setImmediate(() => void session.start());
      return { sessionId: session.id };
    },
    { requiresUnlocked: true },
  );

  // Terminal local não depende do cofre (US4).
  reg.handle(
    'sessions',
    'openLocal',
    z.tuple([z.enum(['powershell', 'cmd']), termSize]),
    (shell, size) => {
      const session = new LocalPtySession(randomUUID(), shell, size, sessions);
      sessions.add(session);
      setImmediate(() => {
        try {
          session.start();
        } catch {
          sessions.emitState({
            sessionId: session.id,
            state: 'exited',
            reason: null,
            exitCode: null,
          });
        }
      });
      return { sessionId: session.id };
    },
  );

  reg.handle(
    'sessions',
    'reconnect',
    z.tuple([id]),
    (sessionId) => {
      const session = sessions.get(sessionId);
      if (!session.reconnect) throw fail('INVALID_INPUT');
      void session.reconnect();
    },
    { requiresUnlocked: true },
  );

  reg.handle('sessions', 'write', z.tuple([id, terminalInput]), (sessionId, data) => {
    sessions.get(sessionId).write(data);
  });

  reg.handle('sessions', 'resize', z.tuple([id, termSize]), (sessionId, size) => {
    sessions.get(sessionId).resize(size);
  });

  reg.handle('sessions', 'close', z.tuple([id]), (sessionId) => {
    sessions.get(sessionId).close();
    sessions.remove(sessionId);
  });

  reg.handle('sessions', 'answerHostKey', z.tuple([id, z.boolean()]), (sessionId, accept) => {
    interactions.answerHostKey(sessionId, accept);
  });

  reg.handle('sessions', 'answerPrompt', z.tuple([id, answers]), (sessionId, values) => {
    interactions.answerPrompt(sessionId, values);
  });

  reg.handle('sessions', 'activeSummary', z.tuple([]), () => ctx.closeGuard.summary());
}

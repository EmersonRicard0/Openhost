import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { LocalShell, SessionStateEvent } from '../../frontend/src/shared/model/types';
import { LocalPtySession } from '../../src/main/local/ptySession';
import { SessionRegistry } from '../../src/main/sessions/registry';

function harness() {
  let output = '';
  const states: SessionStateEvent[] = [];
  const registry = new SessionRegistry({
    data: (_id, data) => {
      output += data;
    },
    state: (event) => states.push(event),
  });
  return { registry, states, output: () => output };
}

async function until(check: () => boolean, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('tempo esgotado');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]|${ESC}\\][^${BEL}]*${BEL}`, 'g');

// Remove sequências ANSI e quebras do ConPTY para comparar texto.
const strip = (s: string) => s.replace(ANSI, '').replace(/\r?\n|\r/g, '');

describe.each<[LocalShell, string]>([
  ['cmd', 'cd'],
  ['powershell', '(Get-Location).Path'],
])('terminal local %s', (shell, pwd) => {
  it('abre no diretório do usuário, redimensiona e sai com código', async () => {
    const h = harness();
    const session = new LocalPtySession('s-' + shell, shell, { cols: 120, rows: 30 }, h.registry);
    h.registry.add(session);
    session.start();
    expect(h.states[0]?.state).toBe('running');

    session.write(`${pwd}\r`);
    await until(() => strip(h.output()).includes(homedir()));

    expect(() => {
      session.resize({ cols: 100, rows: 40 });
    }).not.toThrow();

    session.write('exit 3\r');
    await until(() => h.states.some((s) => s.state === 'exited'));
    const exited = h.states.find((s) => s.state === 'exited');
    expect(exited?.exitCode).toBe(3);
    expect(session.isActive()).toBe(false);
  });
});

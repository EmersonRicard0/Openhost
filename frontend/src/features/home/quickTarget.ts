// Alvo da conexão rápida (specs/010, FR-1001, research R2). O Go valida de novo.

export interface ParsedTarget {
  address: string;
  port: number;
  username: string | null;
}

export type TargetError = 'empty' | 'format' | 'port' | 'sshOption';

const HOST = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const USER = /^[^\s@:[\]]{1,64}$/;
const IPV6 = /^[0-9A-Fa-f:.]+$/;

function port(text: string): number | null {
  if (!/^\d{1,5}$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 65535 ? n : null;
}

/** `[usuário@]endereço[:porta]`, IPv6 entre colchetes com porta, ou `ssh [-p N] [-l u] alvo`. */
export function parseTarget(input: string): ParsedTarget | { error: TargetError } {
  let text = input.trim();
  if (!text) return { error: 'empty' };
  let forcedPort: number | null = null;
  let forcedUser: string | null = null;
  if (/^ssh\s/.test(text)) {
    const words = text.split(/\s+/).slice(1);
    const rest: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const word = words[i] ?? '';
      if (word === '-p' || word === '-l') {
        const value = words[++i];
        if (value === undefined) return { error: 'format' };
        if (word === '-p') {
          forcedPort = port(value);
          if (forcedPort === null) return { error: 'port' };
        } else forcedUser = value;
      } else if (word.startsWith('-')) return { error: 'sshOption' };
      else rest.push(word);
    }
    if (rest.length !== 1) return { error: 'format' };
    text = rest[0] ?? '';
  } else if (/\s/.test(text)) return { error: 'format' };

  let username: string | null = forcedUser;
  const at = text.lastIndexOf('@');
  if (at >= 0) {
    username = text.slice(0, at);
    text = text.slice(at + 1);
  }
  if (username !== null && !USER.test(username)) return { error: 'format' };

  let address: string;
  let parsedPort = 22;
  const bracket = /^\[([^\]]+)\](?::(.*))?$/.exec(text);
  if (bracket) {
    address = bracket[1] ?? '';
    if (!IPV6.test(address)) return { error: 'format' };
    if (bracket[2] !== undefined) {
      const p = port(bracket[2]);
      if (p === null) return { error: 'port' };
      parsedPort = p;
    }
  } else if ((text.match(/:/g) ?? []).length > 1) {
    // IPv6 sem colchetes: não dá para separar a porta.
    if (!IPV6.test(text)) return { error: 'format' };
    address = text;
  } else {
    const [host = '', p] = text.split(':');
    address = host;
    if (p !== undefined) {
      const n = port(p);
      if (n === null) return { error: 'port' };
      parsedPort = n;
    }
    if (!HOST.test(address)) return { error: 'format' };
  }
  return { address, port: forcedPort ?? parsedPort, username };
}

/** Texto do alvo para títulos e recentes: `usuário@endereço[:porta]`. */
export function targetLabel(t: { address: string; port: number; username: string | null }): string {
  const host = t.address.includes(':') ? `[${t.address}]` : t.address;
  const user = t.username ? `${t.username}@` : '';
  return `${user}${host}${t.port === 22 ? '' : `:${String(t.port)}`}`;
}

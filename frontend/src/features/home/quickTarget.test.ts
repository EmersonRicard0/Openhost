import { describe, expect, it } from 'vitest';
import { parseTarget } from './quickTarget';

describe('parseTarget (010, SC-1004)', () => {
  it.each([
    ['host', { address: 'host', port: 22, username: null }],
    ['user@host', { address: 'host', port: 22, username: 'user' }],
    ['host:2222', { address: 'host', port: 2222, username: null }],
    [' user@host:2222 ', { address: 'host', port: 2222, username: 'user' }],
    ['10.0.0.1', { address: '10.0.0.1', port: 22, username: null }],
    ['user@10.0.0.1:22', { address: '10.0.0.1', port: 22, username: 'user' }],
    ['2001:db8::1', { address: '2001:db8::1', port: 22, username: null }],
    ['[2001:db8::1]:2222', { address: '2001:db8::1', port: 2222, username: null }],
    ['user@[2001:db8::1]', { address: '2001:db8::1', port: 22, username: 'user' }],
    ['ssh user@host', { address: 'host', port: 22, username: 'user' }],
    ['ssh -p 2222 user@host', { address: 'host', port: 2222, username: 'user' }],
    ['ssh -l user -p 2222 host', { address: 'host', port: 2222, username: 'user' }],
  ])('%j', (text, target) => {
    expect(parseTarget(text)).toEqual(target);
  });

  it.each([
    ['', 'empty'],
    ['host:0', 'port'],
    ['host:70000', 'port'],
    ['us er@host', 'format'],
    ['ssh -i chave host', 'sshOption'],
    ['user@', 'format'],
  ])('recusa %j', (text, error) => {
    expect(parseTarget(text)).toEqual({ error });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { resolveShell } from '../../../src/main/local/shells';

const original = process.env.SystemRoot;

afterEach(() => {
  process.env.SystemRoot = original;
});

describe('resolveShell', () => {
  it('usa caminhos absolutos a partir de %SystemRoot%', () => {
    process.env.SystemRoot = 'D:\\Win';
    expect(resolveShell('powershell')).toBe(
      'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
    expect(resolveShell('cmd')).toBe('D:\\Win\\System32\\cmd.exe');
  });

  it('usa C:\\Windows quando %SystemRoot% não está definido, nunca o PATH', () => {
    delete process.env.SystemRoot;
    expect(resolveShell('cmd')).toBe('C:\\Windows\\System32\\cmd.exe');
  });

  it('rejeita shells fora da lista', () => {
    expect(() => resolveShell('bash' as never)).toThrow();
    expect(() => resolveShell('C:\\evil.exe' as never)).toThrow();
    expect(() => resolveShell('toString' as never)).toThrow();
  });
});

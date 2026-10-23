// Shells locais permitidos, sempre por caminho absoluto (nunca pelo PATH).
import { win32 } from 'node:path';
import type { LocalShell } from '@shared/model/types';
import { fail } from '../ipc/messages';

const RELATIVE: Record<LocalShell, string> = {
  powershell: 'System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  cmd: 'System32\\cmd.exe',
};

export function resolveShell(shell: LocalShell): string {
  if (!Object.hasOwn(RELATIVE, shell)) throw fail('INVALID_INPUT');
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows';
  return win32.join(systemRoot, RELATIVE[shell]);
}

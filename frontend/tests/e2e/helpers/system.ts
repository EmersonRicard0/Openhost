// Acesso ao app e ao Windows fora da página: o que na 001 vinha do processo principal do Electron.
import { execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { Page } from '@playwright/test';

type GoServices = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;

/** Pede para fechar a janela como o botão "fechar" da barra de título (passa por FR-028). */
export async function requestClose(page: Page): Promise<void> {
  await page
    .evaluate(() => {
      const go = (window as unknown as { go: { bridge: GoServices } }).go;
      void go.bridge.AppService?.WindowClose?.();
    })
    .catch(() => undefined); // A página pode sumir junto com o processo.
}

export function exited(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve) =>
    child.once('exit', (code) => {
      resolve(code);
    }),
  );
}

function powershell(script: string): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  });
}

export function readClipboard(): string {
  return powershell('Get-Clipboard -Raw').replace(/\r?\n$/, '');
}

/** Põe linhas na área de transferência do Windows (unidas por CRLF). */
export function writeClipboard(lines: string[]): void {
  const quoted = lines.map((l) => `'${l.replace(/'/g, "''")}'`).join(',');
  powershell(`Set-Clipboard -Value @(${quoted})`);
}

/** PIDs dos processos em execução cujo executável é `exePath`. */
export function processesOf(exePath: string): number[] {
  const escaped = exePath.replace(/'/g, "''");
  const out = powershell(
    `Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -eq '${escaped}' } | ForEach-Object { $_.ProcessId }`,
  );
  return out
    .split(/\r?\n/)
    .map((l) => Number(l.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

/** Estado da janela principal do processo pelo Win32 (o WebView2 não expõe minimizado). */
export function isMinimised(pid: number): boolean {
  const out = powershell(
    `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);'; [W.U]::IsIconic((Get-Process -Id ${String(pid)}).MainWindowHandle)`,
  );
  return out.trim() === 'True';
}

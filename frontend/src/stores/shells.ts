// Shells locais detectados pelo Go (FR-176): no Windows PowerShell, PowerShell 7, cmd, Git Bash e
// distros WSL; no Linux e no macOS os shells de /etc/shells (specs/004).
import { create } from 'zustand';
import type { LocalShell, LocalShellInfo, LocalShellKind, Platform } from '@shared/model/types';
import { t } from '../i18n/pt-BR';

/** Nomes curtos nas abas e menus; distros WSL ficam como "Ubuntu (WSL)". */
const LABELS: Partial<Record<LocalShellInfo['kind'], string>> = {
  powershell: t.terminal.powershell,
  pwsh: t.terminal.pwsh,
  cmd: t.terminal.cmd,
  gitbash: t.terminal.gitbash,
};

function labelOf(shell: LocalShellInfo): string {
  return shell.kind === 'wsl' ? t.terminal.wsl(shell.label) : (LABELS[shell.kind] ?? shell.label);
}

/** Até a detecção responder (ou se falhar), o que todo sistema tem. */
const FALLBACK: Record<Platform, LocalShellInfo[]> = {
  windows: [
    { id: 'powershell', label: t.terminal.powershell, kind: 'powershell' },
    { id: 'cmd', label: t.terminal.cmd, kind: 'cmd' },
  ],
  linux: [{ id: 'sh', label: 'sh', kind: 'unix' }],
  darwin: [{ id: 'zsh', label: 'zsh', kind: 'unix' }],
};

interface ShellsState {
  shells: LocalShellInfo[];
  load: (platform: Platform) => Promise<void>;
}

export const useShells = create<ShellsState>((set) => ({
  shells: FALLBACK.windows,
  async load(platform) {
    const res = await window.shellvault.app.listLocalShells();
    if (res.ok && res.value.length > 0)
      set({ shells: res.value.map((s) => ({ ...s, label: labelOf(s) })) });
    else set({ shells: FALLBACK[platform] });
  },
}));

const WINDOWS_KINDS: readonly LocalShellKind[] = ['powershell', 'pwsh', 'cmd', 'gitbash'];

/** Tipo de um shell que a detecção não listou (salvo como padrão e depois removido). */
function kindOf(id: LocalShell): LocalShellKind {
  if (id.startsWith('wsl:')) return 'wsl';
  return WINDOWS_KINDS.find((k) => k === id) ?? 'unix';
}

export function shellInfo(id: LocalShell): LocalShellInfo {
  return (
    useShells.getState().shells.find((s) => s.id === id) ?? {
      id,
      label: id.startsWith('wsl:') ? t.terminal.wsl(id.slice(4)) : id,
      kind: kindOf(id),
    }
  );
}

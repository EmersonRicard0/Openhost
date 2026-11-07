// Compila o build de testes uma vez por execução (tag e2e: CDP + TestService) e o Google Drive
// falso dos e2e da sincronização.
import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './helpers/paths';

export default function globalSetup(): void {
  if (process.env.SHELLVAULT_E2E_SKIP_BUILD === '1') return;
  execFileSync('wails', ['build', '-tags', 'e2e', '-o', 'shellvault-e2e.exe'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  execFileSync('go', ['build', '-o', 'build/bin/drivefake.exe', './scripts/drivefake'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

import { resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
/** Binário do build de testes, gerado pelo global-setup. */
export const E2E_EXE = resolve(REPO_ROOT, 'build/bin/shellvault-e2e.exe');
/** Google Drive falso dos e2e da sincronização (scripts/drivefake), gerado pelo global-setup. */
export const DRIVEFAKE_EXE = resolve(REPO_ROOT, 'build/bin/drivefake.exe');

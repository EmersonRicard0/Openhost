// Variáveis só para testes automatizados; ignoradas no app empacotado fora de E2E.
import { app } from 'electron';

function enabled(): boolean {
  return !app.isPackaged || process.env.SHELLVAULT_E2E === '1';
}

function read(name: string): string | null {
  if (!enabled()) return null;
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
}

export const testHooks = {
  get dataDir(): string | null {
    return read('SHELLVAULT_DATA_DIR');
  },
  /** Caminho devolvido pelos diálogos nativos de arquivo em E2E. */
  get dialogPath(): string | null {
    return read('SHELLVAULT_TEST_DIALOG_PATH');
  },
  /** Página carregada com ?e2e=1: o renderer expõe a leitura do buffer do terminal. */
  get e2e(): boolean {
    return read('SHELLVAULT_E2E') === '1';
  },
  get forceSolid(): boolean {
    return read('SHELLVAULT_FORCE_SOLID') === '1';
  },
};

import type { AppError, ErrorCode } from '@shared/ipc/errors';

/** Mensagens fixas por código: nada vindo do erro original chega à interface (FR-005). */
export const MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: 'Dados inválidos.',
  VAULT_LOCKED: 'O cofre está bloqueado. Desbloqueie para continuar.',
  VAULT_NOT_FOUND: 'Nenhum cofre foi criado ainda.',
  VAULT_EXISTS: 'Já existe um cofre neste computador.',
  VAULT_BAD_PASSWORD: 'Senha incorreta ou cofre inválido.',
  VAULT_UNREADABLE: 'O arquivo do cofre está corrompido e não pode ser aberto.',
  VAULT_UNSUPPORTED_VERSION:
    'O cofre foi criado por uma versão mais nova do ShellVault e não pode ser aberto.',
  VAULT_MIGRATION_FAILED:
    'Não foi possível atualizar o cofre da versão anterior. O arquivo original foi mantido intacto.',
  WEAK_PASSWORD: 'A senha mestra precisa ter pelo menos 8 caracteres.',
  NOT_FOUND: 'Item não encontrado.',
  GROUP_CYCLE: 'Um grupo não pode ser movido para dentro de si mesmo.',
  KEY_UNSUPPORTED: 'Formato de chave não suportado. Use OpenSSH ou PEM (Ed25519, ECDSA ou RSA).',
  KEY_BAD_PASSPHRASE: 'A senha da chave está incorreta.',
  CONNECT_TIMEOUT: 'O servidor não respondeu a tempo.',
  CONNECT_REFUSED: 'O servidor recusou a conexão. Verifique o endereço e a porta.',
  HOST_UNREACHABLE: 'Não foi possível encontrar o servidor. Verifique o endereço e a rede.',
  AUTH_FAILED: 'A autenticação falhou.',
  HOST_KEY_REJECTED: 'A chave do servidor não foi aceita. Conexão cancelada.',
  NO_COMMON_ALGORITHM:
    'O servidor só aceita algoritmos antigos. Ative "Algoritmos legados (inseguros)" no host para conectar.',
  AGENT_UNAVAILABLE: 'O agente SSH do Windows não está em execução.',
  SESSION_CLOSED: 'A sessão foi encerrada.',
  SFTP_ERROR: 'A operação de arquivo falhou no servidor.',
  PERMISSION_DENIED: 'Permissão negada.',
  PORT_IN_USE: 'A porta local já está em uso.',
  SCHEME_INVALID: 'O arquivo de esquema de cores é inválido.',
  IN_USE: 'O item está em uso e não pode ser excluído.',
  CANCELLED: 'Operação cancelada.',
  INTERNAL: 'Ocorreu um erro inesperado.',
};

/** Erro de domínio com código conhecido. */
export class AppFailure extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'AppFailure';
  }
}

export function fail(code: ErrorCode): AppFailure {
  return new AppFailure(code);
}

const SYSTEM_CODES: Record<string, ErrorCode> = {
  ECONNREFUSED: 'CONNECT_REFUSED',
  ENOTFOUND: 'HOST_UNREACHABLE',
  EAI_AGAIN: 'HOST_UNREACHABLE',
  EHOSTUNREACH: 'HOST_UNREACHABLE',
  ENETUNREACH: 'HOST_UNREACHABLE',
  ETIMEDOUT: 'CONNECT_TIMEOUT',
  EADDRINUSE: 'PORT_IN_USE',
  EACCES: 'PERMISSION_DENIED',
  EPERM: 'PERMISSION_DENIED',
  ECONNRESET: 'SESSION_CLOSED',
};

const SFTP_STATUS: Record<number, ErrorCode> = {
  2: 'NOT_FOUND',
  3: 'PERMISSION_DENIED',
};

const SSH2_LEVELS: Record<string, ErrorCode> = {
  'client-authentication': 'AUTH_FAILED',
  'client-timeout': 'CONNECT_TIMEOUT',
};

function codeOf(e: unknown): ErrorCode {
  if (e instanceof AppFailure) return e.code;
  if (typeof e !== 'object' || e === null) return 'INTERNAL';
  const { code, level } = e as { code?: unknown; level?: unknown };
  if (typeof level === 'string' && level in SSH2_LEVELS) return SSH2_LEVELS[level] ?? 'INTERNAL';
  if (typeof code === 'string' && code in SYSTEM_CODES) return SYSTEM_CODES[code] ?? 'INTERNAL';
  // Status SFTP numéricos do ssh2 (SSH_FX_*).
  if (typeof code === 'number') return SFTP_STATUS[code] ?? 'SFTP_ERROR';
  return 'INTERNAL';
}

export function appError(code: ErrorCode): AppError {
  return { code, message: MESSAGES[code] };
}

export function toAppError(e: unknown): AppError {
  return appError(codeOf(e));
}

/** Códigos de erro da ponte IPC (specs/002-wails-migration/contracts/bridge.md, "ErrorCode"). */
export const ERROR_CODES = [
  'INVALID_INPUT',
  'VAULT_LOCKED',
  'VAULT_NOT_FOUND',
  'VAULT_EXISTS',
  'VAULT_BAD_PASSWORD',
  'VAULT_UNREADABLE',
  'VAULT_UNSUPPORTED_VERSION',
  'VAULT_MIGRATION_FAILED',
  'WEAK_PASSWORD',
  'NOT_FOUND',
  'GROUP_CYCLE',
  'KEY_UNSUPPORTED',
  'KEY_BAD_PASSPHRASE',
  'CONNECT_TIMEOUT',
  'CONNECT_REFUSED',
  'HOST_UNREACHABLE',
  'AUTH_FAILED',
  'HOST_KEY_REJECTED',
  'NO_COMMON_ALGORITHM',
  'AGENT_UNAVAILABLE',
  'SESSION_CLOSED',
  'SFTP_ERROR',
  'PERMISSION_DENIED',
  'PORT_IN_USE',
  'SCHEME_INVALID',
  'ALREADY_EXISTS',
  'IN_USE',
  'IMPORT_TOO_LARGE',
  'IMPORT_UNREADABLE',
  'IMPORT_FORMAT_NEWER',
  'FILE_PASSWORD_REQUIRED',
  'FILE_PASSWORD_WRONG',
  'PREVIEW_EXPIRED',
  'UNDO_UNAVAILABLE',
  'CANCELLED',
  'NETWORK',
  'RATE_LIMITED',
  'SYNC_UNAVAILABLE',
  'SYNC_CANCELLED',
  'SYNC_AUTH',
  'SYNC_QUOTA',
  'SYNC_FORMAT',
  'CLOUD_EMPTY',
  'CLOUD_CORRUPT',
  'SYNC_FOLDER_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError {
  code: ErrorCode;
  /** Texto pt-BR pronto para a interface; nunca contém segredos nem stack trace. */
  message: string;
  /** Serviço.método da ponte que falhou (FR-174). */
  op?: string;
  /** Detalhe técnico para "Copiar detalhes", já sem segredos. */
  detail?: string;
}

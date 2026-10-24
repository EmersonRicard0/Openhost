/** Códigos de erro da ponte IPC (contracts/ipc-bridge.md, "ErrorCode"). */
export const ERROR_CODES = [
  'INVALID_INPUT',
  'VAULT_LOCKED',
  'VAULT_NOT_FOUND',
  'VAULT_EXISTS',
  'VAULT_BAD_PASSWORD',
  'VAULT_UNREADABLE',
  'VAULT_UNSUPPORTED_VERSION',
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
  'SESSION_CLOSED',
  'SFTP_ERROR',
  'PERMISSION_DENIED',
  'PORT_IN_USE',
  'CANCELLED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface AppError {
  code: ErrorCode;
  /** Texto pt-BR pronto para a interface; nunca contém segredos nem stack trace. */
  message: string;
}

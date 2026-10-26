// Causa de cada erro em linguagem simples (FR-174) e o texto de "Copiar detalhes".
import type { AppError, ErrorCode } from '@shared/ipc/errors';

export const ERROR_CAUSES: Record<ErrorCode, string> = {
  INVALID_INPUT: 'Algum valor informado não é válido.',
  VAULT_LOCKED: 'O cofre está bloqueado.',
  VAULT_NOT_FOUND: 'O cofre não foi encontrado.',
  VAULT_EXISTS: 'Já existe um cofre.',
  VAULT_BAD_PASSWORD: 'Senha mestra incorreta.',
  VAULT_UNREADABLE: 'O arquivo do cofre não pôde ser lido.',
  VAULT_UNSUPPORTED_VERSION: 'O cofre é de uma versão mais nova do app.',
  VAULT_MIGRATION_FAILED: 'A migração do cofre anterior falhou.',
  WEAK_PASSWORD: 'A senha é fraca demais.',
  NOT_FOUND: 'O item não existe mais.',
  GROUP_CYCLE: 'Um grupo não pode ficar dentro dele mesmo.',
  KEY_UNSUPPORTED: 'Formato de chave não suportado.',
  KEY_BAD_PASSPHRASE: 'Passphrase da chave incorreta.',
  CONNECT_TIMEOUT: 'O servidor não respondeu a tempo.',
  CONNECT_REFUSED: 'O servidor recusou a conexão.',
  HOST_UNREACHABLE: 'O endereço não pôde ser alcançado.',
  AUTH_FAILED: 'O servidor recusou a autenticação.',
  HOST_KEY_REJECTED: 'A chave do servidor foi recusada.',
  NO_COMMON_ALGORITHM: 'O servidor só aceita algoritmos que não estão ativos para este host.',
  AGENT_UNAVAILABLE: 'O agente SSH não está disponível. Confira se o ssh-agent está rodando.',
  SESSION_CLOSED: 'A conexão foi encerrada.',
  SFTP_ERROR: 'A operação de arquivos falhou no servidor.',
  PERMISSION_DENIED: 'Sem permissão para esta operação.',
  PORT_IN_USE: 'A porta local já está em uso.',
  SCHEME_INVALID: 'O arquivo de esquema de cores não é válido.',
  ALREADY_EXISTS: 'Já existe um item com esse nome.',
  IN_USE: 'O item está em uso e não pode ser removido.',
  IMPORT_TOO_LARGE: 'O arquivo é grande demais (até 10 MB e 5.000 hosts).',
  IMPORT_UNREADABLE: 'Não encontramos hosts nesse arquivo. Confira se ele é do formato escolhido.',
  IMPORT_FORMAT_NEWER: 'O arquivo foi criado por uma versão mais nova do OpenHost. Atualize o app.',
  FILE_PASSWORD_REQUIRED: 'O arquivo é protegido por senha.',
  FILE_PASSWORD_WRONG: 'Senha incorreta.',
  PREVIEW_EXPIRED: 'A prévia expirou. Escolha a origem de novo.',
  UNDO_UNAVAILABLE: 'Não há importação para desfazer.',
  CANCELLED: 'A operação foi cancelada.',
  NETWORK: 'Sem conexão com a internet ou o serviço não respondeu.',
  RATE_LIMITED: 'Muitas consultas seguidas; tente de novo em alguns minutos.',
  INTERNAL: 'Ocorreu um erro inesperado.',
};

/** Texto copiado por "Copiar detalhes": tudo o que ajuda a diagnosticar, nunca segredos. */
export function errorDetails(error: AppError, at: Date, version: string): string {
  return [
    `Código: ${error.code}`,
    `Mensagem: ${error.message}`,
    error.op ? `Operação: ${error.op}` : null,
    error.detail ? `Detalhe: ${error.detail}` : null,
    `Data/hora: ${at.toISOString()}`,
    `Versão: ${version}`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}

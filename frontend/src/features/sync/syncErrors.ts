// Erros da sincronização em linguagem simples (specs/013, FR-1313–FR-1315): uma frase e a ação,
// com o técnico só em "Detalhes" (código, operação e hora; nunca detail, e-mail ou caminho).
import type { AppError, ErrorCode } from '@shared/ipc/errors';
import { ERROR_CAUSES } from '../../i18n/errors';

export type SyncPlace = { place: 'drive' } | { place: 'folder'; label: string };

export interface SyncErrorView {
  message: string;
  /** O que o botão ao lado da frase faz; `null` sem botão. */
  action: 'reconnect' | 'update' | 'history' | null;
  /** Temporário: só o estado "Pendente", sem aviso, e o app tenta de novo sozinho. */
  quiet: boolean;
  details: string;
}

const QUIET: ReadonlySet<ErrorCode> = new Set([
  'NETWORK',
  'RATE_LIMITED',
  'SYNC_FOLDER_UNAVAILABLE',
]);

function phrase(code: ErrorCode, where: SyncPlace): string {
  const service = where.place === 'folder' ? `a pasta do ${where.label}` : 'o Google Drive';
  switch (code) {
    case 'NETWORK':
    case 'RATE_LIMITED':
      return `Não deu para falar com ${service}. Vamos tentar de novo sozinhos.`;
    case 'SYNC_FOLDER_UNAVAILABLE':
      return `A pasta do ${where.place === 'folder' ? where.label : 'Google Drive'} não está disponível. As mudanças ficam guardadas aqui e vão quando ela voltar.`;
    case 'SYNC_AUTH':
      return 'A conexão com o Google Drive foi perdida.';
    case 'SYNC_CANCELLED':
      return 'Conexão cancelada.';
    case 'SYNC_QUOTA':
      return 'Sem espaço no Google Drive. As mudanças ficam guardadas aqui.';
    case 'SYNC_FORMAT':
      return 'O cofre de lá foi gravado por uma versão mais nova do OpenHost.';
    case 'CLOUD_CORRUPT':
      return 'O cofre de lá está danificado. Volte para uma versão anterior.';
    case 'CLOUD_EMPTY':
      return 'Não há cofre do OpenHost lá ainda.';
    default:
      return ERROR_CAUSES[code];
  }
}

function action(code: ErrorCode): SyncErrorView['action'] {
  if (code === 'SYNC_AUTH') return 'reconnect';
  if (code === 'SYNC_FORMAT') return 'update';
  if (code === 'CLOUD_CORRUPT') return 'history';
  return null;
}

export function syncErrorView(error: AppError, at: Date, where: SyncPlace): SyncErrorView {
  return {
    message: phrase(error.code, where),
    action: action(error.code),
    quiet: QUIET.has(error.code),
    details: [
      `Código: ${error.code}`,
      error.op ? `Operação: ${error.op}` : null,
      `Data/hora: ${at.toISOString()}`,
    ]
      .filter((line) => line !== null)
      .join('\n'),
  };
}

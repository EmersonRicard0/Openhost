import { describe, expect, it } from 'vitest';
import type { AppError } from '@shared/ipc/errors';
import { syncErrorView } from './syncErrors';

const at = new Date('2026-10-31T12:00:00.000Z');
const drive = { place: 'drive' } as const;
const folder = { place: 'folder', label: 'Google Drive' } as const;

describe('erros da sincronização em linguagem simples (013, FR-1313–FR-1315)', () => {
  it('rede: frase sem código, sem aviso e tentativa automática', () => {
    const view = syncErrorView({ code: 'NETWORK', message: 'x' }, at, drive);
    expect(view.message).toBe(
      'Não deu para falar com o Google Drive. Vamos tentar de novo sozinhos.',
    );
    expect(view.quiet).toBe(true);
    expect(view.action).toBeNull();
    expect(view.message).not.toMatch(/NETWORK/);
  });

  it('pasta indisponível cita o programa da pasta', () => {
    const view = syncErrorView({ code: 'SYNC_FOLDER_UNAVAILABLE', message: 'x' }, at, folder);
    expect(view.message).toBe(
      'A pasta do Google Drive não está disponível. As mudanças ficam guardadas aqui e vão quando ela voltar.',
    );
    expect(view.quiet).toBe(true);
  });

  it('autorização perdida pede para conectar de novo', () => {
    const view = syncErrorView({ code: 'SYNC_AUTH', message: 'x' }, at, drive);
    expect(view.message).toBe('A conexão com o Google Drive foi perdida.');
    expect(view.action).toBe('reconnect');
    expect(view.quiet).toBe(false);
  });

  it('cancelar a conexão não soa como erro', () => {
    expect(syncErrorView({ code: 'SYNC_CANCELLED', message: 'x' }, at, drive).message).toBe(
      'Conexão cancelada.',
    );
  });

  it('versão mais nova pede para atualizar; cofre danificado leva às versões anteriores', () => {
    expect(syncErrorView({ code: 'SYNC_FORMAT', message: 'x' }, at, drive).action).toBe('update');
    expect(syncErrorView({ code: 'CLOUD_CORRUPT', message: 'x' }, at, folder).action).toBe(
      'history',
    );
  });

  it('Detalhes só com código, operação e hora; nunca detail, e-mail ou caminho', () => {
    const error: AppError = {
      code: 'SYNC_FOLDER_UNAVAILABLE',
      message: 'C:\\Users\\fulano\\Google Drive',
      op: 'SyncService.SyncNow',
      detail: 'fulano@example.com',
    };
    const details = syncErrorView(error, at, folder).details;
    expect(details).toBe(
      'Código: SYNC_FOLDER_UNAVAILABLE\nOperação: SyncService.SyncNow\nData/hora: 2026-10-31T12:00:00.000Z',
    );
  });

  it('código sem frase própria cai na causa genérica', () => {
    expect(syncErrorView({ code: 'INTERNAL', message: 'x' }, at, drive).message).toBe(
      'Ocorreu um erro inesperado.',
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PreviewRow, PreviewView } from '@shared/model/types';
import { countRows, filterRows, pendingKeys, useImportExport } from './importExport';

function row(over: Partial<PreviewRow>): PreviewRow {
  return {
    rowId: 'r1',
    label: 'web1',
    address: '10.0.0.5',
    port: 22,
    username: 'deploy',
    groupPath: [],
    keyRef: null,
    origin: 'config:1',
    warnings: [],
    state: 'ok',
    duplicateOf: null,
    selected: true,
    duplicateAction: 'skip',
    ...over,
  };
}

function preview(rows: PreviewRow[], over: Partial<PreviewView> = {}): PreviewView {
  return {
    id: 'p1',
    kind: 'openssh',
    sourceLabel: 'config',
    rows,
    keys: [],
    ignored: [],
    fileWarnings: [],
    csv: null,
    ...over,
  };
}

const rows = [
  row({ rowId: 'a' }),
  row({ rowId: 'b', state: 'invalid', selected: false, warnings: [{ code: 'INVALID_PORT' }] }),
  row({ rowId: 'c', state: 'duplicate', selected: false, duplicateOf: { hostId: 'h1' } }),
  row({ rowId: 'd', warnings: [{ code: 'OPTION_IGNORED', name: 'ProxyJump' }] }),
];

describe('contagens e filtro da prévia', () => {
  it('conta marcadas, inválidas, duplicadas e com aviso', () => {
    expect(countRows(rows)).toEqual({
      total: 4,
      selected: 2,
      invalid: 1,
      duplicate: 1,
      warnings: 2,
    });
  });

  it('"precisa de atenção" deixa de fora só as linhas ok sem aviso', () => {
    expect(filterRows(rows, 'attention').map((r) => r.rowId)).toEqual(['b', 'c', 'd']);
    expect(filterRows(rows, 'all')).toHaveLength(4);
  });

  it('só pede passphrase de chaves usadas por linhas marcadas', () => {
    const p = preview(
      [row({ rowId: 'a', keyRef: 'k1' }), row({ rowId: 'b', keyRef: 'k2', selected: false })],
      {
        keys: [
          {
            ref: 'k1',
            name: 'id_rsa',
            path: 'C:/k1',
            status: 'needsPassphrase',
            fingerprint: null,
            usedBy: 1,
          },
          {
            ref: 'k2',
            name: 'id_ed',
            path: 'C:/k2',
            status: 'needsPassphrase',
            fingerprint: null,
            usedBy: 1,
          },
        ],
      },
    );
    expect(pendingKeys(p).map((k) => k.ref)).toEqual(['k1']);
  });
});

describe('fluxo do store', () => {
  const api = {
    preview: vi.fn(),
    discard: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
    commit: vi.fn(),
    undo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useImportExport.getState().reset();
    useImportExport.setState({ undoable: null });
    const hosts = {
      list: () => Promise.resolve({ ok: true, value: [] }),
    };
    Object.assign(globalThis, {
      window: {
        shellvault: {
          imports: api,
          hosts,
          groups: hosts,
          credentials: hosts,
        },
      },
    });
  });

  it('abre a prévia e descarta a anterior', async () => {
    api.preview.mockResolvedValueOnce({ ok: true, value: preview(rows) });
    await useImportExport.getState().open('openssh', { useDefault: true });
    expect(useImportExport.getState().step).toBe('preview');

    api.preview.mockResolvedValueOnce({ ok: true, value: preview(rows, { id: 'p2' }) });
    await useImportExport.getState().open('csv');
    expect(api.discard).toHaveBeenCalledWith('p1');
    expect(useImportExport.getState().preview?.id).toBe('p2');
  });

  it('diálogo cancelado não muda nada', async () => {
    api.preview.mockResolvedValueOnce({ ok: true, value: null });
    await useImportExport.getState().open('csv');
    expect(useImportExport.getState().step).toBe('sources');
    expect(useImportExport.getState().error).toBeNull();
  });

  it('arquivo protegido pede a senha sem mostrar erro; senha errada mostra', async () => {
    const err = (code: string) => ({ ok: false, error: { code, message: code } });
    api.preview.mockResolvedValueOnce(err('FILE_PASSWORD_REQUIRED'));
    await useImportExport.getState().open('openhost');
    expect(useImportExport.getState().passwordFor).toBe('openhost');
    expect(useImportExport.getState().error).toBeNull();

    api.preview.mockResolvedValueOnce(err('FILE_PASSWORD_WRONG'));
    await useImportExport.getState().open('openhost', { filePassword: 'x' });
    expect(useImportExport.getState().passwordFor).toBe('openhost');
    expect(useImportExport.getState().error?.code).toBe('FILE_PASSWORD_WRONG');
  });

  it('confirmar vai ao resumo e permite desfazer uma vez', async () => {
    api.preview.mockResolvedValueOnce({ ok: true, value: preview(rows) });
    await useImportExport.getState().open('openssh', { useDefault: true });
    useImportExport.getState().setTarget('g1');
    api.commit.mockResolvedValueOnce({
      ok: true,
      value: {
        batchId: 'b1',
        created: 2,
        replaced: 0,
        skipped: 1,
        ignored: 0,
        keysStored: 0,
        keysReused: 0,
        askPassword: 2,
      },
    });
    expect(await useImportExport.getState().commit()).toBe(true);
    expect(api.commit).toHaveBeenCalledWith('p1', 'g1');
    expect(useImportExport.getState().step).toBe('summary');
    expect(useImportExport.getState().undoable).toBe('b1');

    api.undo.mockResolvedValueOnce({ ok: true, value: { removed: 2, restored: 0, keptEdited: 0 } });
    expect(await useImportExport.getState().undo()).toEqual({
      removed: 2,
      restored: 0,
      keptEdited: 0,
    });
    expect(useImportExport.getState().undoable).toBeNull();
    expect(await useImportExport.getState().undo()).toBeNull();
  });
});

// Estado da tela "Importar e exportar" (specs/003-host-import-export). A prévia vive no Go;
// aqui fica só a visão dela, sem conteúdo de chaves.
import { create } from 'zustand';
import type { AppError } from '@shared/ipc/errors';
import type {
  CsvMapping,
  DuplicateAction,
  ImportResult,
  ImportSource,
  PreviewKey,
  PreviewOptions,
  PreviewRow,
  PreviewView,
  RowPatch,
  SourceKind,
  UndoResult,
} from '@shared/model/types';
import { useHosts } from './hosts';

export type ImportStep = 'sources' | 'preview' | 'summary';
export type RowFilter = 'all' | 'attention';

export interface PreviewCounts {
  total: number;
  selected: number;
  invalid: number;
  duplicate: number;
  warnings: number;
}

export function countRows(rows: PreviewRow[]): PreviewCounts {
  let selected = 0;
  let invalid = 0;
  let duplicate = 0;
  let warnings = 0;
  for (const r of rows) {
    if (r.selected) selected++;
    if (r.state === 'invalid') invalid++;
    if (r.state === 'duplicate') duplicate++;
    if (r.warnings.length > 0) warnings++;
  }
  return { total: rows.length, selected, invalid, duplicate, warnings };
}

/** "Precisa de atenção": inválida, duplicada ou com aviso. */
export function needsAttention(row: PreviewRow): boolean {
  return row.state !== 'ok' || row.warnings.length > 0;
}

export function filterRows(rows: PreviewRow[], filter: RowFilter): PreviewRow[] {
  return filter === 'all' ? rows : rows.filter(needsAttention);
}

/** Chaves que ainda pedem passphrase e são usadas por alguma linha marcada. */
export function pendingKeys(preview: PreviewView): PreviewKey[] {
  const used = new Set(preview.rows.filter((r) => r.selected && r.keyRef).map((r) => r.keyRef));
  return preview.keys.filter((k) => k.status === 'needsPassphrase' && used.has(k.ref));
}

interface ImportExportState {
  step: ImportStep;
  sources: ImportSource[];
  preview: PreviewView | null;
  /** Origem esperando a senha do arquivo `.openhost`. */
  passwordFor: SourceKind | null;
  targetGroupId: string | null;
  filter: RowFilter;
  busy: boolean;
  error: AppError | null;
  result: ImportResult | null;
  /** Origem do último lote importado, para o resumo. */
  resultKind: SourceKind | null;
  /** Lote que ainda pode ser desfeito. */
  undoable: string | null;
  loadSources: () => Promise<void>;
  open: (kind: SourceKind, options?: PreviewOptions) => Promise<void>;
  remapCsv: (mapping: CsvMapping) => Promise<void>;
  updateRow: (rowId: string, patch: RowPatch) => Promise<void>;
  selectAll: (selected: boolean, groupPath?: string[]) => Promise<void>;
  setDuplicateAction: (action: DuplicateAction) => Promise<void>;
  unlockKey: (keyRef: string, passphrase: string) => Promise<AppError | null>;
  skipKey: (keyRef: string) => Promise<void>;
  setTarget: (groupId: string | null) => void;
  setFilter: (filter: RowFilter) => void;
  commit: () => Promise<boolean>;
  undo: () => Promise<UndoResult | null>;
  cancelPassword: () => void;
  reset: () => void;
}

const initial = {
  step: 'sources' as ImportStep,
  preview: null,
  passwordFor: null,
  targetGroupId: null,
  filter: 'all' as RowFilter,
  busy: false,
  error: null,
  result: null,
  resultKind: null,
};

function replaceKey(preview: PreviewView, key: PreviewKey): PreviewView {
  return { ...preview, keys: preview.keys.map((k) => (k.ref === key.ref ? key : k)) };
}

export const useImportExport = create<ImportExportState>((set, get) => ({
  ...initial,
  sources: [],
  undoable: null,

  async loadSources() {
    const res = await window.shellvault.imports.sources();
    if (res.ok) set({ sources: res.value });
    else set({ error: res.error });
  },

  async open(kind, options = {}) {
    const previous = get().preview;
    set({ busy: true, error: null });
    const res = await window.shellvault.imports.preview(kind, options);
    if (!res.ok) {
      const needsPassword =
        res.error.code === 'FILE_PASSWORD_REQUIRED' || res.error.code === 'FILE_PASSWORD_WRONG';
      set({
        busy: false,
        passwordFor: needsPassword ? kind : null,
        error: res.error.code === 'FILE_PASSWORD_REQUIRED' ? null : res.error,
      });
      return;
    }
    if (!res.value) {
      // Diálogo cancelado: nada muda.
      set({ busy: false, passwordFor: null });
      return;
    }
    if (previous && previous.id !== res.value.id)
      void window.shellvault.imports.discard(previous.id);
    set({
      busy: false,
      passwordFor: null,
      preview: res.value,
      step: 'preview',
      filter: 'all',
      result: null,
    });
  },

  async remapCsv(mapping) {
    const preview = get().preview;
    if (!preview) return;
    set({ busy: true, error: null });
    const res = await window.shellvault.imports.remapCsv(preview.id, mapping);
    set(res.ok ? { busy: false, preview: res.value } : { busy: false, error: res.error });
  },

  async updateRow(rowId, patch) {
    const preview = get().preview;
    if (!preview) return;
    const res = await window.shellvault.imports.updateRow(preview.id, rowId, patch);
    const current = get().preview;
    if (!current || current.id !== preview.id) return;
    set(res.ok ? { preview: res.value, error: null } : { error: res.error });
  },

  async selectAll(selected, groupPath) {
    const preview = get().preview;
    if (!preview) return;
    const res = await window.shellvault.imports.selectAll(preview.id, selected, groupPath ?? null);
    set(res.ok ? { preview: res.value, error: null } : { error: res.error });
  },

  async setDuplicateAction(action) {
    const preview = get().preview;
    if (!preview) return;
    const res = await window.shellvault.imports.setDuplicateAction(preview.id, action);
    set(res.ok ? { preview: res.value, error: null } : { error: res.error });
  },

  async unlockKey(keyRef, passphrase) {
    const preview = get().preview;
    if (!preview) return null;
    const res = await window.shellvault.imports.unlockKey(preview.id, keyRef, passphrase);
    if (!res.ok) return res.error;
    const current = get().preview;
    if (current) set({ preview: replaceKey(current, res.value) });
    return null;
  },

  async skipKey(keyRef) {
    const preview = get().preview;
    if (!preview) return;
    const res = await window.shellvault.imports.skipKey(preview.id, keyRef);
    const current = get().preview;
    if (res.ok && current) set({ preview: replaceKey(current, res.value) });
    else if (!res.ok) set({ error: res.error });
  },

  setTarget(groupId) {
    set({ targetGroupId: groupId });
  },

  setFilter(filter) {
    set({ filter });
  },

  async commit() {
    const { preview, targetGroupId } = get();
    if (!preview) return false;
    set({ busy: true, error: null });
    const res = await window.shellvault.imports.commit(preview.id, targetGroupId);
    if (!res.ok) {
      set({ busy: false, error: res.error });
      return false;
    }
    set({
      busy: false,
      preview: null,
      step: 'summary',
      result: res.value,
      resultKind: preview.kind,
      undoable: res.value.batchId,
    });
    await useHosts.getState().reload();
    return true;
  },

  async undo() {
    const batchId = get().undoable;
    if (!batchId) return null;
    set({ busy: true, error: null });
    const res = await window.shellvault.imports.undo(batchId);
    set({ busy: false, undoable: null, ...(res.ok ? {} : { error: res.error }) });
    await useHosts.getState().reload();
    return res.ok ? res.value : null;
  },

  cancelPassword() {
    set({ passwordFor: null });
  },

  reset() {
    const preview = get().preview;
    if (preview) void window.shellvault.imports.discard(preview.id);
    set({ ...initial });
  },
}));

// Estado de interface do espaço de trabalho que atalhos, paleta e terminais compartilham.
import { create } from 'zustand';

export const FONT_MIN = 8;
export const FONT_MAX = 32;

interface PendingPaste {
  sessionId: string;
  text: string;
}

interface WorkspaceState {
  /** Ajuste de fonte por aba (Ctrl+=/−/0), somado ao tamanho das configurações. */
  zoom: Record<string, number>;
  /** Aba com a barra de busca aberta. */
  searchFor: string | null;
  paletteOpen: boolean;
  settingsOpen: boolean;
  pendingPaste: PendingPaste | null;
  /** Aba esperando confirmação para fechar (Ctrl+W com conexão ativa). */
  confirmClose: string | null;
  zoomBy: (sessionId: string, delta: number, base: number) => void;
  zoomReset: (sessionId: string) => void;
  setSearchFor: (sessionId: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setPendingPaste: (paste: PendingPaste | null) => void;
  setConfirmClose: (sessionId: string | null) => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  zoom: {},
  searchFor: null,
  paletteOpen: false,
  settingsOpen: false,
  pendingPaste: null,
  confirmClose: null,
  zoomBy(sessionId, delta, base) {
    const current = get().zoom[sessionId] ?? 0;
    const size = Math.min(FONT_MAX, Math.max(FONT_MIN, base + current + delta));
    set({ zoom: { ...get().zoom, [sessionId]: size - base } });
  },
  zoomReset(sessionId) {
    set({
      zoom: Object.fromEntries(Object.entries(get().zoom).filter(([id]) => id !== sessionId)),
    });
  },
  setSearchFor(searchFor) {
    set({ searchFor });
  },
  setPaletteOpen(paletteOpen) {
    set({ paletteOpen });
  },
  setSettingsOpen(settingsOpen) {
    set({ settingsOpen });
  },
  setPendingPaste(pendingPaste) {
    set({ pendingPaste });
  },
  setConfirmClose(confirmClose) {
    set({ confirmClose });
  },
}));

/** Tamanho de fonte efetivo da aba. */
export function fontSizeOf(sessionId: string, base: number, zoom: Record<string, number>): number {
  return Math.min(FONT_MAX, Math.max(FONT_MIN, base + (zoom[sessionId] ?? 0)));
}

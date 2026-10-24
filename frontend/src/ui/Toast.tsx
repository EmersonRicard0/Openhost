// Erros e avisos na interface (FR-030: nada vai para arquivo de log).
import { create } from 'zustand';
import type { AppError } from '@shared/ipc/errors';
import { t } from '../i18n/pt-BR';
import { CloseIcon } from './icons';
import s from './ui.module.css';

interface ToastItem {
  id: number;
  kind: 'error' | 'info';
  text: string;
}

interface ToastState {
  items: ToastItem[];
  push: (kind: ToastItem['kind'], text: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push(kind, text) {
    const id = nextId++;
    set({ items: [...get().items.slice(-3), { id, kind, text }] });
    setTimeout(
      () => {
        get().dismiss(id);
      },
      kind === 'error' ? 8000 : 4000,
    );
  },
  dismiss(id) {
    set({ items: get().items.filter((i) => i.id !== id) });
  },
}));

export function toastError(error: AppError | string): void {
  useToasts.getState().push('error', typeof error === 'string' ? error : error.message);
}

export function toastInfo(text: string): void {
  useToasts.getState().push('info', text);
}

export function Toasts() {
  const { items, dismiss } = useToasts();
  return (
    <div className={s.toasts} role="status" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          role={item.kind === 'error' ? 'alert' : undefined}
          className={`${s.toast} ${item.kind === 'error' ? s.toastError : s.toastInfo} raised glass-edge`}
        >
          <span style={{ flex: 1 }}>{item.text}</span>
          <button
            type="button"
            className={`${s.button} ${s.ghost} ${s.icon}`}
            aria-label={t.common.close}
            onClick={() => {
              dismiss(item.id);
            }}
          >
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}

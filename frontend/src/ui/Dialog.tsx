import { useEffect, useId, useRef, type SubmitEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './ui.module.css';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  /** Quando definido, o conteúdo vira um <form> e Enter envia. */
  onSubmit?: () => void;
  /** Impede fechar com Esc/clique fora (ex.: decisão de host key). */
  modal?: boolean;
  width?: number;
}

export function Dialog({
  title,
  children,
  actions,
  onClose,
  onSubmit,
  modal = false,
  width,
}: DialogProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first = root?.querySelector<HTMLElement>('[autofocus], input, select, textarea') ?? root;
    first?.focus();
    return () => previous?.focus();
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && !modal) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    // Mantém o foco dentro do diálogo.
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onSubmit?.();
  }

  const body = (
    <>
      <h2 id={titleId} className={s.dialogTitle}>
        {title}
      </h2>
      {children}
      {actions && <div className={s.dialogActions}>{actions}</div>}
    </>
  );

  return createPortal(
    <div
      className={s.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !modal) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${s.dialog} raised glass-edge`}
        style={width ? { width: `min(${width}px, calc(100vw - 48px))` } : undefined}
        onKeyDown={onKeyDown}
      >
        {onSubmit ? (
          <form onSubmit={submit} style={{ display: 'contents' }}>
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>,
    document.body,
  );
}

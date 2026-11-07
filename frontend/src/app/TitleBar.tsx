// Barra de título própria (FR-133): área de arrasto, ações do app e botões da janela.
// Fora do Windows os botões da janela são do sistema (specs/004, R4): no macOS os nativos ficam
// sobre o canto esquerdo do cabeçalho; no Linux a moldura inteira é do gerenciador de janelas.
import { useEffect, useState, type ReactNode } from 'react';
import type { Platform } from '@shared/model/types';
import { t } from '../i18n/pt-BR';
import { useUi } from '../stores/ui';
import { CloseIcon, MaximiseIcon, MinimiseIcon, RestoreIcon } from '../ui/icons';
import { Logo } from '../ui/Logo';
import s from './titlebar.module.css';

function useMaximised(): boolean {
  const [maximised, setMaximised] = useState(false);
  useEffect(() => {
    let alive = true;
    const sync = () => {
      void window.shellvault.app.windowIsMaximised().then((res) => {
        if (alive && res.ok) setMaximised(res.value);
      });
    };
    sync();
    window.addEventListener('resize', sync);
    return () => {
      alive = false;
      window.removeEventListener('resize', sync);
    };
  }, []);
  return maximised;
}

export interface TitleBarLayout {
  /** Minimizar, maximizar e fechar desenhados pelo app. */
  windowControls: boolean;
  /** Cabeçalho arrasta a janela (e duplo clique maximiza). */
  draggable: boolean;
  /** Espaço livre à esquerda para os botões nativos do macOS. */
  insetLeft: boolean;
}

export function titleBarLayout(platform: Platform): TitleBarLayout {
  switch (platform) {
    case 'darwin':
      return { windowControls: false, draggable: true, insetLeft: true };
    case 'linux':
      return { windowControls: false, draggable: false, insetLeft: false };
    default:
      return { windowControls: true, draggable: true, insetLeft: false };
  }
}

export interface TitleBarProps {
  /** Antes da marca (alternar a barra lateral). */
  leading?: ReactNode;
  /** Ações do app à direita (encaminhamentos, bloquear, configurações). */
  actions?: ReactNode;
}

export function TitleBar({ leading, actions }: TitleBarProps) {
  const layout = titleBarLayout(useUi((u) => u.platform));
  const app = window.shellvault.app;

  return (
    <header
      className={`${s.titleBar} ${layout.draggable ? 'drag' : ''} ${layout.insetLeft ? s.inset : ''}`}
      onDoubleClick={(e) => {
        // Só na área de arrasto, não nos botões.
        if (
          layout.draggable &&
          (e.target === e.currentTarget || (e.target as HTMLElement).dataset.dragArea !== undefined)
        )
          void app.windowToggleMaximise();
      }}
    >
      {leading && <div className={`${s.leading} no-drag`}>{leading}</div>}
      <span className={s.brand} data-drag-area>
        <Logo size={16} variant="mark" />
        <span className={s.appName} data-drag-area>
          {t.common.appName}
        </span>
      </span>
      <span className={s.spacer} data-drag-area />
      {actions && <div className={`${s.actions} no-drag`}>{actions}</div>}
      {layout.windowControls && <WindowControls />}
    </header>
  );
}

function WindowControls() {
  const maximised = useMaximised();
  const app = window.shellvault.app;
  return (
    <div className={`${s.windowControls} no-drag`}>
      <button
        type="button"
        className={s.control}
        aria-label={t.window.minimise}
        title={t.window.minimise}
        onClick={() => void app.windowMinimise()}
      >
        <MinimiseIcon />
      </button>
      <button
        type="button"
        className={s.control}
        aria-label={maximised ? t.window.restore : t.window.maximise}
        title={maximised ? t.window.restore : t.window.maximise}
        onClick={() => void app.windowToggleMaximise()}
      >
        {maximised ? (
          <RestoreIcon width={14} height={14} />
        ) : (
          <MaximiseIcon width={13} height={13} />
        )}
      </button>
      <button
        type="button"
        className={`${s.control} ${s.close}`}
        aria-label={t.window.close}
        title={t.window.close}
        onClick={() => void app.windowClose()}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

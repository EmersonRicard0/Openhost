import { useEffect, useRef, type ReactNode } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { Tab } from '../../stores/sessions';
import { useUi } from '../../stores/ui';
import { ANSI, type ThemeTokens } from '../../theme/tokens';
import { attach, rememberSize } from './dataBus';
import { registerProbe } from './testProbe';
import s from './terminal.module.css';

function xtermTheme(tokens: ThemeTokens, dark: boolean): ITheme {
  return {
    background: tokens.terminalBackground,
    foreground: tokens.terminalForeground,
    cursor: tokens.terminalCursor,
    cursorAccent: tokens.terminalBackground,
    selectionBackground: tokens.terminalSelection,
    ...(dark ? ANSI.dark : ANSI.light),
  };
}

async function copySelection(term: Terminal): Promise<boolean> {
  const text = term.getSelection();
  if (!text) return false;
  await navigator.clipboard.writeText(text);
  term.clearSelection();
  return true;
}

async function paste(term: Terminal): Promise<void> {
  const text = await navigator.clipboard.readText();
  if (text) term.paste(text);
}

export interface TerminalViewProps {
  tab: Tab;
  active: boolean;
  /** Faixa sobre o terminal (desconectado, processo encerrado). */
  banner?: ReactNode;
}

export function TerminalView({ tab, active, banner }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const settings = useUi((u) => u.settings);
  const tokens = useUi((u) => u.tokens);
  const dark = useUi((u) => u.dark);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Cria o terminal uma vez por aba.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ui = useUi.getState();
    const term = new Terminal({
      scrollback: 10_000,
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: ui.settings?.terminalFontFamily ?? 'Cascadia Mono, Consolas, monospace',
      fontSize: ui.settings?.terminalFontSize ?? 14,
      theme: xtermTheme(ui.tokens, ui.dark),
      rightClickSelectsWord: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    const sessionId = tab.id;
    const api = window.shellvault.sessions;
    const unregisterProbe = registerProbe(sessionId, term);
    const detach = attach(sessionId, (data) => {
      term.write(data);
    });
    const onData = term.onData((data) => {
      void api.write(sessionId, data);
    });
    const onResize = term.onResize(({ cols, rows }) => {
      rememberSize({ cols, rows });
      void api.resize(sessionId, { cols, rows });
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true;
      if (e.code === 'KeyC') {
        void copySelection(term);
        return false;
      }
      if (e.code === 'KeyV') {
        void paste(term);
        return false;
      }
      return true;
    });
    // Clique direito: copia se houver seleção, senão cola.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      void copySelection(term).then((copied) => (copied ? undefined : paste(term)));
    };
    container.addEventListener('contextmenu', onContextMenu);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Aba oculta tem tamanho 0: o fit só roda quando visível.
        if (activeRef.current && container.clientWidth > 0) fit.fit();
      }, 50);
    });
    observer.observe(container);

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      container.removeEventListener('contextmenu', onContextMenu);
      onData.dispose();
      onResize.dispose();
      detach();
      unregisterProbe();
      term.dispose();
      termRef.current = null;
    };
  }, [tab.id]);

  // WebGL só na aba visível (limite de contextos do Chromium; research R4).
  useEffect(() => {
    const term = termRef.current;
    if (!term || !active) return;
    let webgl: WebglAddon | null = null;
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl?.dispose();
        webgl = null;
      });
      term.loadAddon(webgl);
    } catch {
      webgl = null; // Sem WebGL: fica o renderer DOM.
    }
    requestAnimationFrame(() => {
      fitRef.current?.fit();
      term.focus();
    });
    return () => {
      webgl?.dispose();
    };
  }, [active]);

  // Preferências e tema aplicados ao vivo (FR-018).
  useEffect(() => {
    const term = termRef.current;
    if (!term || !settings) return;
    term.options.fontFamily = settings.terminalFontFamily;
    term.options.fontSize = settings.terminalFontSize;
    if (active) fitRef.current?.fit();
  }, [settings, active]);

  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = xtermTheme(tokens, dark);
  }, [tokens, dark]);

  return (
    <div
      className={`${s.view} ${active ? '' : s.hidden}`}
      role="tabpanel"
      aria-label={tab.title}
      data-session-id={tab.id}
    >
      {banner}
      <div ref={containerRef} className={`${s.xterm} solid`} />
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { Tab } from '../../stores/sessions';
import { useUi } from '../../stores/ui';
import { fontSizeOf, useWorkspace } from '../../stores/workspace';
import { ANSI, type ThemeTokens } from '../../theme/tokens';
import { attach } from './dataBus';
import { needsConfirm } from './paste';
import { SearchBar } from './SearchBar';
import { registerTerminal } from './terminalRegistry';
import { countResize, registerProbe } from './testProbe';
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

/** Cola; várias linhas passam antes pela confirmação (FR-144). */
function pasteText(sessionId: string, term: Terminal, text: string): void {
  if (!text) return;
  if (needsConfirm(text)) useWorkspace.getState().setPendingPaste({ sessionId, text });
  else term.paste(text);
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
  const fitNowRef = useRef<() => void>(() => undefined);
  const activeRef = useRef(active);
  const settings = useUi((u) => u.settings);
  const tokens = useUi((u) => u.tokens);
  const dark = useUi((u) => u.dark);
  const zoom = useWorkspace((w) => w.zoom);
  const searching = useWorkspace((w) => w.searchFor === tab.id);
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
      fontSize: fontSizeOf(
        tab.id,
        ui.settings?.terminalFontSize ?? 14,
        useWorkspace.getState().zoom,
      ),
      theme: xtermTheme(ui.tokens, ui.dark),
      rightClickSelectsWord: false,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    // Ctrl+clique abre no navegador padrão; o app não faz a requisição (FR-145).
    term.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (event.ctrlKey) void window.shellvault.app.openExternalUrl(uri);
      }),
    );
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    const sessionId = tab.id;
    const api = window.shellvault.sessions;
    let lastSize: { cols: number; rows: number } | null = null;
    const fitAndResize = () => {
      if (!activeRef.current || container.clientWidth <= 0 || container.clientHeight <= 0) return;
      fit.fit();
      const size = { cols: term.cols, rows: term.rows };
      if (size.cols <= 0 || size.rows <= 0) return;
      if (lastSize?.cols === size.cols && lastSize.rows === size.rows) return;
      lastSize = size;
      countResize(sessionId);
      void api.resize(sessionId, size);
    };
    fitNowRef.current = fitAndResize;
    const unregisterProbe = registerProbe(sessionId, term);
    const unregisterTerminal = registerTerminal(sessionId, {
      term,
      search,
      focus: () => {
        if (activeRef.current) term.focus();
      },
    });
    const detach = attach(sessionId, (data) => {
      term.write(data);
    });
    const onData = term.onData((data) => {
      void api.write(sessionId, data);
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || !e.shiftKey) return true;
      if (e.code === 'KeyC') {
        void copySelection(term);
        return false;
      }
      // Ctrl+Shift+V: o xterm não trata a tecla; a colagem chega pelo evento `paste` abaixo.
      if (e.code === 'KeyV') return false;
      return true;
    });
    // Selecionar copia (FR-143); por isso o clique direito só cola (FR-144).
    let copyTimer: ReturnType<typeof setTimeout> | null = null;
    const onSelection = term.onSelectionChange(() => {
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        const text = term.getSelection();
        if (text) void navigator.clipboard.writeText(text);
      }, 120);
    });
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      void navigator.clipboard.readText().then((text) => {
        pasteText(sessionId, term, text);
      });
    };
    container.addEventListener('contextmenu', onContextMenu);
    // Toda colagem nativa (Ctrl+Shift+V, menu do sistema) passa pela confirmação antes do xterm.
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pasteText(sessionId, term, e.clipboardData?.getData('text/plain') ?? '');
    };
    container.addEventListener('paste', onPaste, true);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Aba oculta tem tamanho 0: o fit só roda quando visível.
        fitAndResize();
      }, 50);
    });
    observer.observe(container);

    // Troca de monitor com outra escala: o tamanho em CSS pode não mudar, mas a célula muda.
    let stopDpr: () => void = () => undefined;
    const watchDpr = () => {
      const query = matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`);
      const onChange = () => {
        fitAndResize();
        watchDpr();
      };
      query.addEventListener('change', onChange, { once: true });
      stopDpr = () => {
        query.removeEventListener('change', onChange);
      };
    };
    watchDpr();

    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      stopDpr();
      if (copyTimer) clearTimeout(copyTimer);
      onSelection.dispose();
      unregisterTerminal();
      container.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('paste', onPaste, true);
      onData.dispose();
      detach();
      unregisterProbe();
      term.dispose();
      termRef.current = null;
      fitNowRef.current = () => undefined;
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
      fitNowRef.current();
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
    term.options.fontSize = fontSizeOf(tab.id, settings.terminalFontSize, zoom);
    if (active) fitNowRef.current();
  }, [settings, zoom, tab.id, active]);

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
      {searching && <SearchBar sessionId={tab.id} />}
      <div ref={containerRef} className={`${s.xterm} solid`} />
    </div>
  );
}

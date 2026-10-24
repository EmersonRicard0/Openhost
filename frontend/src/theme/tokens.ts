// Tokens visuais próprios do ShellVault (FR-031–FR-034). Cores em rgba() ou #rrggbb.

export type ThemeMode =
  'glass-dark' | 'glass-light' | 'solid-dark' | 'solid-light' | 'high-contrast';

export interface ThemeTokens {
  /** Superfície da moldura; translúcida nos modos de vidro (opacidade mínima por FR-034). */
  surfaceGlass: string;
  /** Superfície elevada (diálogos, menus) sobre a moldura. */
  surfaceRaised: string;
  /** Borda de 1 px com brilho sutil. */
  glassEdge: string;
  /** Painéis opacos: terminal e SFTP (FR-032). */
  panelSolid: string;
  /** Campos de texto e áreas rebaixadas. */
  inputBackground: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  hover: string;
  selected: string;
  accent: string;
  /** Preenchimento dos botões primários e da marca. */
  accentGradient: string;
  /** Halo de foco e destaque suave em volta do acento. */
  accentSoft: string;
  accentText: string;
  danger: string;
  warning: string;
  success: string;
  focus: string;
  shadow: string;
  /** Brilho de fundo das telas cheias (cofre). */
  backdropGlow: string;
  terminalBackground: string;
  terminalForeground: string;
  terminalCursor: string;
  terminalSelection: string;
}

const darkTerminal = {
  terminalBackground: '#0e1016',
  terminalForeground: '#e3e6ee',
  terminalCursor: '#a99bff',
  terminalSelection: 'rgba(139, 120, 255, 0.32)',
};

const lightTerminal = {
  terminalBackground: '#fcfcfe',
  terminalForeground: '#1b1e27',
  terminalCursor: '#5b3df0',
  terminalSelection: 'rgba(91, 61, 240, 0.20)',
};

const dark = {
  textPrimary: '#f3f4f8',
  textSecondary: '#c3c7d4',
  border: 'rgba(255, 255, 255, 0.08)',
  hover: 'rgba(255, 255, 255, 0.06)',
  selected: 'rgba(139, 120, 255, 0.20)',
  accent: '#6e4ff5',
  accentGradient: 'linear-gradient(135deg, #6e4ff5 0%, #2f6fe0 100%)',
  accentSoft: 'rgba(139, 120, 255, 0.28)',
  accentText: '#ffffff',
  danger: '#ff7b7b',
  warning: '#f0b955',
  success: '#4fd18b',
  focus: '#a99bff',
  shadow: '0 18px 48px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.30)',
  backdropGlow:
    'radial-gradient(1200px 600px at 15% -10%, rgba(110, 79, 245, 0.30), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(47, 111, 224, 0.25), transparent 60%)',
  panelSolid: '#0e1016',
  inputBackground: 'rgba(0, 0, 0, 0.28)',
  ...darkTerminal,
};

const light = {
  textPrimary: '#151821',
  textSecondary: '#454b5a',
  border: 'rgba(21, 24, 33, 0.10)',
  hover: 'rgba(21, 24, 33, 0.05)',
  selected: 'rgba(91, 61, 240, 0.12)',
  accent: '#5b3df0',
  accentGradient: 'linear-gradient(135deg, #5b3df0 0%, #2563d9 100%)',
  accentSoft: 'rgba(91, 61, 240, 0.22)',
  accentText: '#ffffff',
  danger: '#c4322b',
  warning: '#9a6400',
  success: '#1f7a46',
  focus: '#5b3df0',
  shadow: '0 18px 48px rgba(21, 24, 33, 0.16), 0 2px 6px rgba(21, 24, 33, 0.08)',
  backdropGlow:
    'radial-gradient(1200px 600px at 15% -10%, rgba(91, 61, 240, 0.16), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(37, 99, 217, 0.14), transparent 60%)',
  panelSolid: '#fcfcfe',
  inputBackground: 'rgba(255, 255, 255, 0.85)',
  ...lightTerminal,
};

export const THEMES: Record<ThemeMode, ThemeTokens> = {
  'glass-dark': {
    ...dark,
    surfaceGlass: 'rgba(18, 20, 28, 0.80)',
    surfaceRaised: 'rgba(28, 31, 43, 0.94)',
    glassEdge:
      'linear-gradient(160deg, rgba(255,255,255,0.20), rgba(255,255,255,0.03) 40%, rgba(169,155,255,0.18))',
  },
  'glass-light': {
    ...light,
    surfaceGlass: 'rgba(246, 247, 251, 0.82)',
    surfaceRaised: 'rgba(255, 255, 255, 0.95)',
    glassEdge:
      'linear-gradient(160deg, rgba(255,255,255,0.95), rgba(255,255,255,0.35) 40%, rgba(91,61,240,0.16))',
  },
  'solid-dark': {
    ...dark,
    surfaceGlass: '#14161e',
    surfaceRaised: '#1d2030',
    glassEdge: 'linear-gradient(rgba(255,255,255,0.09), rgba(255,255,255,0.09))',
  },
  'solid-light': {
    ...light,
    surfaceGlass: '#f2f3f8',
    surfaceRaised: '#ffffff',
    glassEdge: 'linear-gradient(rgba(21,24,33,0.10), rgba(21,24,33,0.10))',
  },
  // Alto contraste: cores de sistema do Windows, sem translucidez.
  'high-contrast': {
    surfaceGlass: 'Canvas',
    surfaceRaised: 'Canvas',
    glassEdge: 'linear-gradient(CanvasText, CanvasText)',
    panelSolid: 'Canvas',
    inputBackground: 'Canvas',
    textPrimary: 'CanvasText',
    textSecondary: 'CanvasText',
    border: 'CanvasText',
    hover: 'Highlight',
    selected: 'Highlight',
    accent: 'ButtonText',
    accentGradient: 'ButtonText',
    accentSoft: 'Highlight',
    accentText: 'ButtonFace',
    danger: 'CanvasText',
    warning: 'CanvasText',
    success: 'CanvasText',
    focus: 'Highlight',
    shadow: 'none',
    backdropGlow: 'none',
    terminalBackground: 'Canvas',
    terminalForeground: 'CanvasText',
    terminalCursor: 'CanvasText',
    terminalSelection: 'Highlight',
  },
};

export const GLASS_MODES: ThemeMode[] = ['glass-dark', 'glass-light'];
export const SOLID_MODES: ThemeMode[] = ['solid-dark', 'solid-light'];

/** Paleta ANSI própria para o xterm. */
export const ANSI = {
  dark: {
    black: '#1d2026',
    red: '#ff7b72',
    green: '#5cc98b',
    yellow: '#e8c35a',
    blue: '#6aa8f0',
    magenta: '#c792ea',
    cyan: '#56c8d8',
    white: '#cdd2da',
    brightBlack: '#5c6370',
    brightRed: '#ffa198',
    brightGreen: '#8ee0ae',
    brightYellow: '#f5d77f',
    brightBlue: '#9cc6ff',
    brightMagenta: '#dcb2f5',
    brightCyan: '#8ce0ec',
    brightWhite: '#f6f8fa',
  },
  light: {
    black: '#24292f',
    red: '#c4322b',
    green: '#1f7a46',
    yellow: '#8a5d00',
    blue: '#1f6fd1',
    magenta: '#8e44b5',
    cyan: '#0f7c8a',
    white: '#6e7681',
    brightBlack: '#57606a',
    brightRed: '#d9473f',
    brightGreen: '#2a8f55',
    brightYellow: '#a06d00',
    brightBlue: '#3b82e0',
    brightMagenta: '#a35bc8',
    brightCyan: '#16909f',
    brightWhite: '#8c959f',
  },
} as const;

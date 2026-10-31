// Cores dos ambientes de host (specs/009, FR-902, research R2/R7). O cofre guarda só o id; o valor
// muda com o tema para manter contraste com a barra de abas e com o fundo do terminal.
import type { EnvironmentColor } from '@shared/model/types';

export const ENVIRONMENT_COLORS: readonly EnvironmentColor[] = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'slate',
  'pink',
];

const DARK: Record<EnvironmentColor, string> = {
  red: '#f25f5c',
  orange: '#ff8a3d',
  amber: '#f5c542',
  green: '#4cc38a',
  teal: '#2ec4b6',
  blue: '#5b9cf5',
  slate: '#9aa5b1',
  pink: '#f472b6',
};

const LIGHT: Record<EnvironmentColor, string> = {
  red: '#c62828',
  orange: '#c2410c',
  amber: '#a16207',
  green: '#15803d',
  teal: '#0f766e',
  blue: '#1d4ed8',
  slate: '#475569',
  pink: '#be185d',
};

/** Valor da cor no tema atual. No alto contraste o Windows impõe as cores, e vale a do escuro. */
export function environmentColor(color: EnvironmentColor, dark: boolean): string {
  return (dark ? DARK : LIGHT)[color];
}

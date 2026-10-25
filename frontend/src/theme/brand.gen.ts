// Gerado por brand/export_app_tokens.py a partir de brand/brand.json. Não edite à mão.

export const BRAND = {
  pretoPiano: '#050505',
  laca: '#0b0b0b',
  superficie: '#171717',
  grafite: '#1e2026',
  nevoa: '#f5f5f5',
  cinza: '#a6a6a6',
  papel: '#f3f3f1',
  branco: '#ffffff',
  tinta: '#111111',
  chumbo: '#4a4a4a',
  laranjaOpenhost: '#fd7b17',
  laranjaProfundo: '#b04e06',
  perigo: '#ff7b7b',
  perigoProfundo: '#c4322b',
  aviso: '#f0b955',
  avisoProfundo: '#9a6400',
  sucesso: '#4fd18b',
  sucessoProfundo: '#1f7a46',
} as const;

export const BRAND_ACCENTS = {
  laranja: { label: 'Laranja', dark: '#fd7b17', light: '#b04e06' },
  grafite: { label: 'Grafite', dark: '#f2f2f2', light: '#111111' },
} as const;

export type BrandAccentId = keyof typeof BRAND_ACCENTS;

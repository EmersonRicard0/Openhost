// Marca do OpenHost (brand/logo.png): anel aberto como um "O" e o chevron do prompt. Em tamanhos
// pequenos (barra de título) a variante "mark" dispensa o quadrado para a marca ocupar o espaço.
export function Logo({
  size = 20,
  variant = 'tile',
}: {
  size?: number;
  variant?: 'tile' | 'mark';
}) {
  const mark = variant === 'mark';
  return (
    <svg
      width={size}
      height={size}
      viewBox={mark ? '6.2 6.2 11.6 11.6' : '0 0 24 24'}
      aria-hidden="true"
      focusable="false"
    >
      {!mark && (
        <rect x="1" y="1" width="22" height="22" rx="5.6" style={{ fill: 'var(--brand-tile)' }} />
      )}
      <path
        d="M16.78 10.98A4.89 4.89 0 1 0 16.78 13.02"
        fill="none"
        strokeWidth="1.1"
        strokeLinecap="round"
        style={{ stroke: 'var(--brand-ring)' }}
      />
      <path
        d="M10.45 9.9L12.6 12l-2.15 2.1"
        fill="none"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--brand-chevron)' }}
      />
    </svg>
  );
}

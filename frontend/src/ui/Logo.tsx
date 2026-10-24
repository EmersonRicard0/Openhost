// Marca do ShellVault: cofre arredondado com prompt `>_` (desenho próprio, Princípio I).
import { useId } from 'react';

export function Logo({ size = 20 }: { size?: number }) {
  const gradient = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b6cff" />
          <stop offset="1" stopColor="#2f6fe0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill={`url(#${gradient})`} />
      <rect
        x="1.5"
        y="1.5"
        width="21"
        height="21"
        rx="6"
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1"
      />
      <path
        d="M7 8.5l3.5 3.5L7 15.5M12.5 16h4.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

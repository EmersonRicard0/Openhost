import type { OsId } from '@shared/model/types';
import { OsLogo, osLogoColors } from './osIcons';
import s from './ui.module.css';

export function initialsOf(text: string): string {
  const words = text
    .split(/[\s._-]+/)
    .map((w) => Array.from(w)[0] ?? '')
    .filter((c) => c !== '');
  return (words.length > 1 ? (words[0] ?? '') + (words[1] ?? '') : (words[0] ?? '?')).toUpperCase();
}

export interface AvatarProps {
  text: string;
  size?: number;
  /** Logo do sistema no lugar das iniciais (FR-178). */
  os?: OsId | null;
}

/** Quadrado de cor única para todos os hosts; o logo do sistema vem na cor oficial da marca. */
export function Avatar({ text, size = 28, os = null }: AvatarProps) {
  const colors = os ? osLogoColors(os) : null;
  return (
    <span
      className={s.avatar}
      aria-hidden="true"
      data-os={os ?? undefined}
      style={
        {
          '--logo-dark': colors?.dark ?? undefined,
          '--logo-light': colors?.light ?? undefined,
          width: size,
          height: size,
        } as React.CSSProperties
      }
    >
      {os ? <OsLogo id={os} size={Math.round(size * 0.57)} /> : initialsOf(text)}
    </span>
  );
}

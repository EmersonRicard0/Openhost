import { avatarFill } from '../theme/avatar';
import s from './ui.module.css';

/** Matiz estável derivado do texto, para cada host ter sempre a mesma cor. */
export function hueOf(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + (ch.codePointAt(0) ?? 0)) % 360;
  return h;
}

export function initialsOf(text: string): string {
  const words = text
    .split(/[\s._-]+/)
    .map((w) => Array.from(w)[0] ?? '')
    .filter((c) => c !== '');
  return (words.length > 1 ? (words[0] ?? '') + (words[1] ?? '') : (words[0] ?? '?')).toUpperCase();
}

export function Avatar({ text, size = 28 }: { text: string; size?: number }) {
  return (
    <span
      className={s.avatar}
      aria-hidden="true"
      style={
        {
          '--avatar-fill': avatarFill(hueOf(text)),
          width: size,
          height: size,
        } as React.CSSProperties
      }
    >
      {initialsOf(text)}
    </span>
  );
}

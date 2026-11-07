import type { ReactNode } from 'react';
import s from './settings.module.css';

/** Bloco de uma seção das Configurações, com título opcional. */
export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className={s.group}>
      {title && <h3 className={s.groupTitle}>{title}</h3>}
      {children}
    </div>
  );
}

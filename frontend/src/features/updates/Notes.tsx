import { parseNotes } from './releaseNotes';
import s from './updates.module.css';

/** Notas da versão em texto: títulos, listas e parágrafos; nada de HTML da release. */
export function Notes({ text }: { text: string }) {
  return (
    <div className={s.notes}>
      {parseNotes(text).map((block, i) =>
        block.kind === 'heading' ? (
          <p key={i} className={s.notesHeading}>
            {block.text}
          </p>
        ) : block.kind === 'list' ? (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{block.text}</p>
        ),
      )}
    </div>
  );
}

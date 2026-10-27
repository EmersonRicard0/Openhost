// Campo de tags do host (specs/009, FR-916): Enter ou vírgula adiciona, Backspace vazio tira a última.
import { useId, useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { CloseIcon } from '../../ui/icons';
import { addTag, type TagError } from './tags';
import ui from '../../ui/ui.module.css';
import s from './hosts.module.css';

const MESSAGES: Record<TagError, string> = {
  duplicate: t.hosts.tagDuplicate,
  tooLong: t.hosts.tagTooLong,
  limit: t.hosts.tagLimit,
};

export interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** Erro vindo do Go ao salvar. */
  error?: string | null;
}

export function TagInput({ tags, onChange, error }: TagInputProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<TagError | null>(null);

  function commit(): boolean {
    const res = addTag(tags, draft);
    if ('error' in res) {
      setProblem(res.error);
      return false;
    }
    setProblem(null);
    setDraft('');
    if (res.tags !== tags) onChange(res.tags);
    return true;
  }

  const message = problem ? MESSAGES[problem] : (error ?? null);
  return (
    <div className={ui.field}>
      <label className={ui.label} htmlFor={id}>
        {t.hosts.tags}
      </label>
      <div className={`${ui.inputWrap} ${s.tagInput}`}>
        {tags.map((tag) => (
          <span key={tag} className={s.tagChip} data-tag="">
            {tag}
            <button
              type="button"
              className={s.tagRemove}
              aria-label={t.hosts.tagRemove(tag)}
              onClick={() => {
                onChange(tags.filter((x) => x !== tag));
              }}
            >
              <CloseIcon width={10} height={10} />
            </button>
          </span>
        ))}
        <input
          id={id}
          className={ui.input}
          spellCheck={false}
          autoComplete="off"
          value={draft}
          aria-invalid={message ? true : undefined}
          onChange={(e) => {
            setProblem(null);
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              // Enter com o campo vazio segue para o envio do formulário.
              if (e.key === 'Enter' && draft.trim() === '') return;
              e.preventDefault();
              commit();
            } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              onChange(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (draft.trim()) commit();
          }}
        />
      </div>
      {message ? (
        <span className={ui.error} role="alert">
          {message}
        </span>
      ) : (
        <span className={ui.hint}>{t.hosts.tagsHint}</span>
      )}
    </div>
  );
}

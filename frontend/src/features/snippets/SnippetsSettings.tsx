// Configurações → Comandos (specs/012, US3/T016): lista à esquerda, formulário à direita.
import { useMemo, useState } from 'react';
import type { Snippet, SnippetInput } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useSnippets } from '../../stores/snippets';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { CopyIcon, PlusIcon } from '../../ui/icons';
import { TextAreaField, TextField } from '../../ui/TextField';
import { toastError, toastInfo } from '../../ui/Toast';
import { TagInput } from '../hosts/TagInput';
import { parseFields } from './fields';
import s from './snippets.module.css';

const EMPTY: SnippetInput = { name: '', text: '', tags: [], execute: false };

function inputOf(snippet: Snippet | undefined): SnippetInput {
  return snippet
    ? { name: snippet.name, text: snippet.text, tags: snippet.tags, execute: snippet.execute }
    : EMPTY;
}

function same(a: SnippetInput, b: SnippetInput): boolean {
  return (
    a.name === b.name &&
    a.text === b.text &&
    a.execute === b.execute &&
    a.tags.join('\n') === b.tags.join('\n')
  );
}

function firstLine(text: string): string {
  return text.split('\n', 1)[0] ?? '';
}

export function SnippetsSettings() {
  const snippets = useSnippets((x) => x.snippets);
  const { create, update, remove, duplicate } = useSnippets.getState();
  // 'new' = rascunho ainda não salvo. Sem escolha (ou o escolhido sumiu, apagado em outro
  // computador), vale o primeiro da lista.
  const [chosen, setChosen] = useState<string | null>(null);
  const selected =
    chosen === 'new'
      ? 'new'
      : snippets.some((x) => x.id === chosen)
        ? chosen
        : (snippets[0]?.id ?? null);
  const current = snippets.find((x) => x.id === selected);
  const saved = selected === 'new' ? EMPTY : inputOf(current);
  // O rascunho só vale para o item em que foi feito; sem alteração, mostra o salvo (que pode ter
  // mudado pela sincronização).
  const [edit, setEdit] = useState<{
    for: string | null;
    value: SnippetInput;
    error: string | null;
  } | null>(null);
  const editing = edit?.for === selected ? edit : null;
  const draft = editing && (selected === 'new' || !same(editing.value, saved)) ? editing.value : saved;
  const error = editing?.error ?? null;
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const setSelected = (id: string | null) => {
    setChosen(id);
    setEdit(null);
  };
  const setDraft = (value: SnippetInput) => {
    setEdit({ for: selected, value, error: null });
  };
  const setError = (message: string | null) => {
    setEdit({ for: selected, value: draft, error: message });
  };

  const dirty = !same(draft, saved);
  const fields = useMemo(() => parseFields(draft.text), [draft.text]);
  const canSave = dirty && draft.name.trim() !== '' && draft.text.trim() !== '' && !busy;

  function startNew() {
    let n = 1;
    while (snippets.some((x) => x.name.toLowerCase() === t.snippets.newName(n).toLowerCase())) n++;
    setChosen('new');
    setEdit({ for: 'new', value: { ...EMPTY, name: t.snippets.newName(n) }, error: null });
  }

  async function save() {
    setBusy(true);
    const input = { ...draft, name: draft.name.trim() };
    const res = selected === 'new' || !current ? await create(input) : await update(current.id, input);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setSelected(res.value.id);
    toastInfo(t.snippets.saved);
  }

  async function copy() {
    if (!current) return;
    const res = await duplicate(current.id);
    if (!res.ok) toastError(res.error);
    else setSelected(res.value.id);
  }

  async function doRemove() {
    setConfirmRemove(false);
    if (!current) return;
    const index = snippets.findIndex((x) => x.id === current.id);
    const res = await remove(current.id);
    if (!res.ok) {
      toastError(res.error);
      return;
    }
    const next = snippets[index + 1] ?? snippets[index - 1];
    setSelected(next && next.id !== current.id ? next.id : null);
  }

  const showForm = selected === 'new' || current !== undefined;

  return (
    <div className={s.layout}>
      <p className={s.hint}>{t.snippets.hint}</p>
      <div className={s.columns}>
        <div className={s.side}>
          <Button onClick={startNew}>
            <PlusIcon />
            {t.snippets.new}
          </Button>
          {snippets.length === 0 && selected !== 'new' ? (
            <p className={s.empty}>{t.snippets.empty}</p>
          ) : (
            <ul className={s.list} role="list" aria-label={t.snippets.list}>
              {selected === 'new' && (
                <li>
                  <button type="button" className={s.item} aria-current="true">
                    <span className={s.itemName}>{draft.name || t.snippets.new}</span>
                  </button>
                </li>
              )}
              {snippets.map((x) => (
                <li key={x.id}>
                  <button
                    type="button"
                    className={s.item}
                    aria-current={x.id === selected ? 'true' : undefined}
                    onClick={() => {
                      setSelected(x.id);
                    }}
                  >
                    <span className={s.itemName}>{x.name}</span>
                    <span className={s.itemText}>{firstLine(x.text)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showForm && (
          <form
            className={s.form}
            aria-label={draft.name || t.snippets.new}
            onSubmit={(e) => {
              e.preventDefault();
              if (canSave) void save();
            }}
          >
            <TextField
              label={t.snippets.name}
              value={draft.name}
              maxLength={64}
              onChange={(e) => {
                setDraft({ ...draft, name: e.target.value });
              }}
            />
            <TextAreaField
              label={t.snippets.text}
              hint={
                fields.length > 0
                  ? `${t.snippets.fieldsCount(fields.length)}: ${fields.join(', ')}`
                  : t.snippets.textHint
              }
              rows={6}
              className={s.code}
              value={draft.text}
              onChange={(e) => {
                setDraft({ ...draft, text: e.target.value });
              }}
            />
            <div className={s.tags}>
              <TagInput
                tags={draft.tags}
                onChange={(tags) => {
                  setDraft({ ...draft, tags });
                }}
              />
              <span className={s.hint}>{t.snippets.tagsHint}</span>
            </div>
            <Checkbox
              label={t.snippets.execute}
              hint={t.snippets.executeHint}
              checked={draft.execute}
              onChange={(e) => {
                setDraft({ ...draft, execute: e.target.checked });
              }}
            />
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}
            <div className={s.actions}>
              {current && selected !== 'new' && (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmRemove(true);
                    }}
                  >
                    {t.snippets.remove}
                  </Button>
                  <Button variant="ghost" onClick={() => void copy()}>
                    <CopyIcon />
                    {t.snippets.duplicate}
                  </Button>
                </>
              )}
              <span className={s.spacer} />
              <Button type="submit" variant="primary" disabled={!canSave}>
                {t.snippets.save}
              </Button>
            </div>
          </form>
        )}
      </div>
      {confirmRemove && current && (
        <ConfirmDialog
          title={t.snippets.removeTitle}
          message={t.snippets.removeMessage(current.name)}
          confirmLabel={t.snippets.remove}
          danger
          onConfirm={() => void doRemove()}
          onCancel={() => {
            setConfirmRemove(false);
          }}
        />
      )}
    </div>
  );
}

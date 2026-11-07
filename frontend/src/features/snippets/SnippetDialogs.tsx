// Formulário de campos (specs/012, US4/T019) e confirmação de produção do envio ao grupo (US5).
import { useState } from 'react';
import type { Snippet } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useSnippets } from '../../stores/snippets';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import { FIELD_MAX, fieldError, parseFields } from './fields';
import {
  cancelSend,
  confirmProduction,
  pendingProduction,
  submitFields,
  useSnippetSend,
} from './sendSnippet';

export function SnippetDialogs() {
  const pending = useSnippetSend((x) => x.pending);
  if (!pending) return null;
  if (pending.stage === 'fields') return <FieldsDialog key={pending.snippet.id} snippet={pending.snippet} />;
  return <ProductionConfirm />;
}

function FieldsDialog({ snippet }: { snippet: Snippet }) {
  const names = parseFields(snippet.text);
  const last = useSnippets((x) => x.lastValues[snippet.id]);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(names.map((n) => [n, last?.[n] ?? ''])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    const found: Record<string, string> = {};
    for (const n of names) {
      const problem = fieldError(n, values[n] ?? '');
      if (problem) found[n] = problem;
    }
    setErrors(found);
    if (Object.keys(found).length === 0) submitFields(values);
  }

  return (
    <Dialog
      title={t.snippets.fieldsTitle(snippet.name)}
      onClose={cancelSend}
      onSubmit={submit}
      width={420}
      actions={
        <>
          <Button onClick={cancelSend}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary">
            {t.snippets.send}
          </Button>
        </>
      }
    >
      {names.map((n, i) => (
        <TextField
          key={n}
          label={n}
          value={values[n] ?? ''}
          maxLength={FIELD_MAX + 1}
          error={errors[n] ?? null}
          autoFocus={i === 0}
          onChange={(e) => {
            setValues({ ...values, [n]: e.target.value });
          }}
          onPaste={(e) => {
            // Colar com quebra de linha seria cortado pelo campo de uma linha; mostra a recusa.
            const text = e.clipboardData.getData('text/plain');
            if (/[\r\n]/.test(text)) {
              e.preventDefault();
              setErrors({ ...errors, [n]: fieldError(n, text) ?? '' });
            }
          }}
        />
      ))}
    </Dialog>
  );
}

function ProductionConfirm() {
  const prod = pendingProduction();
  const b = t.terminal.broadcast;
  return (
    <Dialog
      title={b.prodTitle}
      onClose={cancelSend}
      onSubmit={confirmProduction}
      actions={
        <>
          <Button onClick={cancelSend} autoFocus>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="danger">
            {b.prodConfirm}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{b.prodMessage(prod.length)}</p>
      <ul style={{ margin: 0 }}>
        {prod.map((tb) => (
          <li key={tb.id}>{tb.baseTitle}</li>
        ))}
      </ul>
    </Dialog>
  );
}

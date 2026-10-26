// Etapas da importação depois de escolher a origem: prévia (FR-302 a FR-306) e resumo
// (FR-309, FR-310). A gravação só acontece em "Importar".
import { useState } from 'react';
import type { CsvField, CsvMapping, PreviewView } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import {
  countRows,
  filterRows,
  pendingKeys,
  useImportExport,
  type RowFilter,
} from '../../stores/importExport';
import { Button } from '../../ui/Button';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Spinner } from '../../ui/Spinner';
import { toastInfo } from '../../ui/Toast';
import { KeyPassphraseDialog } from './Dialogs';
import { groupOptions, ROOT, warningText } from './options';
import { PreviewTable } from './PreviewTable';
import s from './importexport.module.css';

const ie = t.importExport;
const FIELDS: CsvField[] = ['endereco', 'nome', 'porta', 'usuario', 'grupo', 'chave'];

function CsvMappingPanel({ preview }: { preview: PreviewView }) {
  const remap = useImportExport((st) => st.remapCsv);
  const csv = preview.csv;
  const [mapping, setMapping] = useState<CsvMapping | null>(csv?.mapping ?? null);
  if (!csv || !mapping) return null;
  const NONE = '';
  const options = [
    { value: NONE, label: ie.mappingNone },
    ...csv.columns.map((c, i) => ({ value: String(i), label: c || `#${String(i + 1)}` })),
  ];
  return (
    <section className={s.mapping} aria-labelledby="csv-mapping-title">
      <h3 id="csv-mapping-title" className={s.blockTitle}>
        {ie.mappingTitle}
      </h3>
      <p className={s.hint}>{ie.mappingIntro}</p>
      <div className={s.mappingGrid}>
        {FIELDS.map((field) => (
          <Select
            key={field}
            label={ie.mappingFields[field]}
            value={mapping[field] === null ? NONE : String(mapping[field])}
            options={options}
            onChange={(value) => {
              setMapping({ ...mapping, [field]: value === NONE ? null : Number(value) });
            }}
          />
        ))}
      </div>
      <div className={s.actions}>
        <Button
          variant="primary"
          disabled={mapping.endereco === null}
          onClick={() => void remap(mapping)}
        >
          {ie.mappingApply}
        </Button>
      </div>
    </section>
  );
}

function Notes({ preview }: { preview: PreviewView }) {
  if (preview.ignored.length === 0 && preview.fileWarnings.length === 0) return null;
  return (
    <div className={s.notes}>
      {preview.ignored.length > 0 && (
        <details className={s.note}>
          <summary>{ie.ignoredTitle(preview.ignored.length)}</summary>
          <ul>
            {preview.ignored.map((item, i) => (
              <li key={`${item.name}-${String(i)}`}>
                <strong>{item.name}</strong> — {item.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
      {preview.fileWarnings.length > 0 && (
        <details className={s.note}>
          <summary>{ie.fileWarningsTitle(preview.fileWarnings.length)}</summary>
          <ul>
            {preview.fileWarnings.map((w, i) => (
              <li key={`${w.code}-${String(i)}`}>{warningText(w)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function PreviewStep({ preview }: { preview: PreviewView }) {
  const st = useImportExport();
  const groups = useHosts((h) => h.groups);
  const [asking, setAsking] = useState(false);
  const counts = countRows(preview.rows);
  const rows = filterRows(preview.rows, st.filter);
  const needsMapping = preview.csv?.needsMapping ?? false;
  const nextKey = asking ? pendingKeys(preview)[0] : undefined;

  async function confirm() {
    if (pendingKeys(preview).length > 0) {
      setAsking(true);
      return;
    }
    await st.commit();
  }

  // Ao responder a última chave pendente, segue direto para a gravação.
  async function afterKey() {
    const current = useImportExport.getState().preview;
    if (current && pendingKeys(current).length > 0) return;
    setAsking(false);
    await st.commit();
  }

  return (
    <div className={s.preview}>
      <header className={s.previewHeader}>
        <div>
          <h3 className={s.blockTitle}>{ie.previewTitle(preview.sourceLabel)}</h3>
          <p className={s.counts} aria-live="polite">
            <span>{ie.counts(counts.selected, counts.total)}</span>
            {counts.invalid > 0 && (
              <span data-tone="danger">{ie.countInvalid(counts.invalid)}</span>
            )}
            {counts.duplicate > 0 && (
              <span data-tone="warning">{ie.countDuplicate(counts.duplicate)}</span>
            )}
            {counts.warnings > 0 && <span>{ie.countWarnings(counts.warnings)}</span>}
          </p>
        </div>
        <div className={s.target}>
          <Select
            label={ie.target}
            hint={ie.targetHint}
            value={st.targetGroupId ?? ROOT}
            options={groupOptions(groups, ie.targetRoot)}
            onChange={(value) => {
              st.setTarget(value === ROOT ? null : value);
            }}
          />
        </div>
      </header>

      {needsMapping ? (
        <CsvMappingPanel key={preview.id} preview={preview} />
      ) : (
        <>
          <Notes preview={preview} />
          <div className={s.toolbar}>
            <Segmented<RowFilter>
              label={ie.filter}
              value={st.filter}
              options={[
                { value: 'all', label: ie.filterAll },
                { value: 'attention', label: ie.filterAttention },
              ]}
              onChange={st.setFilter}
            />
            <div className={s.toolbarActions}>
              <Button variant="ghost" onClick={() => void st.selectAll(true)}>
                {ie.selectAll}
              </Button>
              <Button variant="ghost" onClick={() => void st.selectAll(false)}>
                {ie.selectNone}
              </Button>
              {counts.duplicate > 0 && (
                <div className={s.dupAll}>
                  <span className={s.hint}>{ie.duplicatesAll}</span>
                  {(['skip', 'replace', 'keepBoth'] as const).map((action) => (
                    <Button
                      key={action}
                      variant="ghost"
                      onClick={() => void st.setDuplicateAction(action)}
                    >
                      {ie.duplicateActions[action]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <PreviewTable
            rows={rows}
            keys={preview.keys}
            emptyText={st.filter === 'all' ? ie.empty : ie.emptyAttention}
            onUpdate={(rowId, patch) => void st.updateRow(rowId, patch)}
          />
        </>
      )}

      {st.error && (
        <p role="alert" className={s.error}>
          {st.error.message}
        </p>
      )}

      <footer className={s.footer}>
        {st.busy && <Spinner label={ie.importing} />}
        <Button onClick={st.reset} disabled={st.busy}>
          {t.common.cancel}
        </Button>
        <Button
          variant="primary"
          disabled={st.busy || needsMapping || counts.selected === 0}
          onClick={() => void confirm()}
        >
          {ie.confirm(counts.selected)}
        </Button>
      </footer>

      {nextKey && (
        <KeyPassphraseDialog
          key={nextKey.ref}
          keyInfo={nextKey}
          onUnlock={async (passphrase) => {
            const err = await st.unlockKey(nextKey.ref, passphrase);
            if (!err) await afterKey();
            return err;
          }}
          onSkip={() => {
            void st.skipKey(nextKey.ref).then(afterKey);
          }}
          onCancel={() => {
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

export function SummaryStep() {
  const st = useImportExport();
  const result = st.result;
  if (!result) return null;
  const sm = ie.summary;

  async function undo() {
    const res = await st.undo();
    if (res) toastInfo(ie.undone(res.removed + res.restored, res.keptEdited));
  }

  return (
    <section className={s.summary} aria-labelledby="import-summary-title">
      <h3 id="import-summary-title" className={s.summaryTitle}>
        {ie.summaryTitle}
      </h3>
      <ul className={s.summaryList}>
        <li data-tone="success">{sm.created(result.created)}</li>
        {result.replaced > 0 && <li>{sm.replaced(result.replaced)}</li>}
        {result.skipped > 0 && <li>{sm.skipped(result.skipped)}</li>}
        {result.ignored > 0 && <li>{sm.ignored(result.ignored)}</li>}
        {result.keysStored + result.keysReused > 0 && (
          <li>{sm.keys(result.keysStored, result.keysReused)}</li>
        )}
      </ul>
      {result.askPassword > 0 && <p className={s.hint}>{sm.askPassword(result.askPassword)}</p>}
      {st.error && (
        <p role="alert" className={s.error}>
          {st.error.message}
        </p>
      )}
      <div className={s.actions}>
        {st.undoable && <Button onClick={() => void undo()}>{ie.undo}</Button>}
        <Button variant="primary" autoFocus onClick={st.reset}>
          {ie.importMore}
        </Button>
      </div>
    </section>
  );
}

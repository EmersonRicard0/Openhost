// Conflitos de sincronização (specs/008, FR-811): as duas versões lado a lado, o usuário escolhe.
import { useState } from 'react';
import type { ConflictSide, ConflictView } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { resolveConflict, useSync } from '../../stores/sync';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { toastError } from '../../ui/Toast';
import s from './sync.module.css';

function Side({
  title,
  side,
  deletedText,
  busy,
  onKeep,
}: {
  title: string;
  side: ConflictSide;
  deletedText: string;
  busy: boolean;
  onKeep: () => void;
}) {
  return (
    <section className={s.side} aria-label={title}>
      <h4 className={s.sideTitle}>{title}</h4>
      {side.deleted ? (
        <p className={s.deleted}>{deletedText}</p>
      ) : (
        <dl className={s.fields}>
          {side.summary.map((f) => (
            <div key={f.field} className={s.field}>
              <dt>{f.field}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button disabled={busy} onClick={onKeep}>
        {t.sync.conflictDialog.keep}
      </Button>
    </section>
  );
}

function Conflict({ item }: { item: ConflictView }) {
  const tc = t.sync.conflictDialog;
  const [busy, setBusy] = useState(false);
  const keep = (which: 'local' | 'remote') => {
    setBusy(true);
    void resolveConflict(item.key, which).then((err) => {
      setBusy(false);
      if (err) toastError(err);
    });
  };

  return (
    <li className={s.conflict} data-conflict={item.key}>
      <p className={s.conflictTitle}>
        <span className={s.kind}>{tc.kinds[item.kind]}</span> {item.label}
      </p>
      <div className={s.sides}>
        <Side
          title={tc.here}
          side={item.local}
          deletedText={tc.deletedHere}
          busy={busy}
          onKeep={() => {
            keep('local');
          }}
        />
        <Side
          title={tc.other}
          side={item.remote}
          deletedText={tc.deletedOther}
          busy={busy}
          onKeep={() => {
            keep('remote');
          }}
        />
      </div>
    </li>
  );
}

export function ConflictDialog({ onClose }: { onClose: () => void }) {
  const tc = t.sync.conflictDialog;
  const conflicts = useSync((st) => st.conflicts);

  return (
    <Dialog
      title={tc.title}
      onClose={onClose}
      width={640}
      actions={<Button onClick={onClose}>{t.common.close}</Button>}
    >
      <p className={s.intro}>{tc.intro}</p>
      <ul className={s.conflicts}>
        {conflicts.map((item) => (
          <Conflict key={item.key} item={item} />
        ))}
      </ul>
    </Dialog>
  );
}

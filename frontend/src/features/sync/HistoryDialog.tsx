// Versões anteriores do cofre na nuvem (specs/008, FR-815).
import { useEffect, useState } from 'react';
import type { CloudVersion } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { listVersions, restoreVersion } from '../../stores/sync';
import { Button } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { Dialog } from '../../ui/Dialog';
import { Spinner } from '../../ui/Spinner';
import { toastError, toastInfo } from '../../ui/Toast';
import s from './sync.module.css';

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR');

export function HistoryDialog({ onClose }: { onClose: () => void }) {
  const th = t.sync.historyDialog;
  const [versions, setVersions] = useState<CloudVersion[] | null>(null);
  const [confirm, setConfirm] = useState<CloudVersion | null>(null);

  useEffect(() => {
    void listVersions().then((res) => {
      if (res.ok) setVersions(res.value);
      else {
        toastError(res.error);
        onClose();
      }
    });
  }, [onClose]);

  return (
    <>
      <Dialog
        title={th.title}
        onClose={onClose}
        width={520}
        actions={<Button onClick={onClose}>{t.common.close}</Button>}
      >
        <p className={s.intro}>{th.intro}</p>
        {versions === null ? (
          <Spinner />
        ) : versions.length === 0 ? (
          <p className={s.intro}>{th.empty}</p>
        ) : (
          <ul className={s.versions}>
            {versions.map((v) => (
              <li key={v.name} className={s.version} data-version={v.name}>
                <span>{th.item(when(v.createdAt), v.deviceName, v.items)}</span>
                <Button
                  onClick={() => {
                    setConfirm(v);
                  }}
                >
                  {th.restore}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>
      {confirm && (
        <ConfirmDialog
          title={th.confirmTitle}
          message={th.confirmMessage(when(confirm.createdAt))}
          confirmLabel={th.restore}
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => {
            const name = confirm.name;
            setConfirm(null);
            void restoreVersion(name).then((err) => {
              if (err) toastError(err);
              else {
                toastInfo(th.done);
                onClose();
              }
            });
          }}
        />
      )}
    </>
  );
}

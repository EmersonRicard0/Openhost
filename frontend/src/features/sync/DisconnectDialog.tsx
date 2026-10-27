import { useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { disconnect } from '../../stores/sync';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { toastError } from '../../ui/Toast';

/** Desconectar: para tudo e pergunta se apaga a cópia da nuvem (FR-816). */
export function DisconnectDialog({ onClose }: { onClose: () => void }) {
  const td = t.sync.disconnectDialog;
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (busy) return;
    setBusy(true);
    void disconnect(erase).then((err) => {
      setBusy(false);
      if (err) toastError(err);
      else onClose();
    });
  };

  return (
    <Dialog
      title={td.title}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant={erase ? 'danger' : 'primary'} disabled={busy} autoFocus>
            {td.confirm}
          </Button>
        </>
      }
    >
      <p>{td.message}</p>
      <Checkbox
        label={td.erase}
        hint={td.eraseHint}
        checked={erase}
        onChange={(e) => {
          setErase(e.target.checked);
        }}
      />
    </Dialog>
  );
}

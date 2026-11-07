import { useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { startSync } from '../../stores/sync';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Segmented } from '../../ui/Segmented';
import { TextField } from '../../ui/TextField';

/** Conta com cofre na nuvem + cofre local: juntar, usar o da nuvem ou cancelar (FR-814). */
export function StartChoiceDialog({ email, onClose }: { email: string; onClose: () => void }) {
  const ts = t.sync.start;
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    void startSync(mode, password).then((err) => {
      setBusy(false);
      if (err) setError(err.message);
      else onClose();
    });
  };

  return (
    <Dialog
      title={ts.title}
      onClose={onClose}
      onSubmit={submit}
      width={460}
      actions={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={!password || busy}>
            {ts.confirm}
          </Button>
        </>
      }
    >
      <p>{ts.message(email)}</p>
      <Segmented
        label={ts.title}
        value={mode}
        options={[
          { value: 'merge', label: ts.merge },
          { value: 'replace', label: ts.replace },
        ]}
        onChange={setMode}
        hint={mode === 'merge' ? ts.mergeHint : ts.replaceHint}
      />
      <TextField
        label={ts.password}
        secret
        autoComplete="current-password"
        value={password}
        error={error}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
    </Dialog>
  );
}

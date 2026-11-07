import { useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { providePassword } from '../../stores/sync';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';

/** Senha mestra trocada em outro computador: a antiga não vale mais (FR-812). */
export function NewPasswordDialog({ onClose }: { onClose: () => void }) {
  const tn = t.sync.newPassword;
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    void providePassword(password).then((err) => {
      setBusy(false);
      if (err) setError(err.message);
      else onClose();
    });
  };

  return (
    <Dialog
      title={tn.title}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={!password || busy}>
            {tn.confirm}
          </Button>
        </>
      }
    >
      <p>{tn.message}</p>
      <TextField
        label={tn.password}
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

// Diálogos de senha da importação: passphrase de chave (FR-321) e senha do arquivo `.openhost`.
import { useState } from 'react';
import type { AppError } from '@shared/ipc/errors';
import type { PreviewKey } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { TextField } from '../../ui/TextField';
import s from './importexport.module.css';

const ie = t.importExport;

export interface KeyPassphraseDialogProps {
  keyInfo: PreviewKey;
  /** Devolve o erro quando a passphrase não abre a chave. */
  onUnlock: (passphrase: string) => Promise<AppError | null>;
  onSkip: () => void;
  onCancel: () => void;
}

/** Pede a passphrase uma vez por chave; "Pular chave" segue sem ela (o host pede senha). */
export function KeyPassphraseDialog({
  keyInfo,
  onUnlock,
  onSkip,
  onCancel,
}: KeyPassphraseDialogProps) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!passphrase || busy) return;
    setBusy(true);
    setError(null);
    const err = await onUnlock(passphrase);
    setBusy(false);
    if (err) setError(err.message);
  }

  return (
    <Dialog
      title={ie.passphraseTitle(keyInfo.name)}
      onClose={onCancel}
      onSubmit={() => void submit()}
      actions={
        <>
          <Button onClick={onSkip} disabled={busy}>
            {ie.skipKey}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !passphrase}>
            {ie.unlockKey}
          </Button>
        </>
      }
    >
      <p className={s.dialogText}>
        {ie.passphraseIntro(keyInfo.usedBy)} <span className={s.path}>{keyInfo.path}</span>
      </p>
      <TextField
        label={ie.passphrase}
        secret
        autoFocus
        value={passphrase}
        error={error}
        onChange={(e) => {
          setPassphrase(e.target.value);
          setError(null);
        }}
      />
    </Dialog>
  );
}

export interface FilePasswordDialogProps {
  error: AppError | null;
  busy: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function FilePasswordDialog({ error, busy, onSubmit, onCancel }: FilePasswordDialogProps) {
  const [password, setPassword] = useState('');
  return (
    <Dialog
      title={ie.filePasswordTitle}
      onClose={onCancel}
      onSubmit={() => {
        if (password) onSubmit(password);
      }}
      actions={
        <>
          <Button onClick={onCancel}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={busy || !password}>
            {ie.openFile}
          </Button>
        </>
      }
    >
      <p className={s.dialogText}>{ie.filePasswordIntro}</p>
      <TextField
        label={ie.filePassword}
        secret
        autoFocus
        value={password}
        error={error?.code === 'FILE_PASSWORD_WRONG' ? error.message : null}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
    </Dialog>
  );
}

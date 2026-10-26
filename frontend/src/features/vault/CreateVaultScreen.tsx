import { useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { startSync, useSync } from '../../stores/sync';
import { useVault } from '../../stores/vault';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { CloudIcon, WarningIcon } from '../../ui/icons';
import { Logo } from '../../ui/Logo';
import { toastError } from '../../ui/Toast';
import { OpenFromCloud } from '../sync/OpenFromCloud';
import s from './vault.module.css';

const MIN_LENGTH = 8;

export function CreateVaultScreen() {
  const create = useVault((v) => v.create);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncAvailable = useSync((st) => st.info?.available ?? false);
  const [cloud, setCloud] = useState(false);
  /** Conta conectada sem cofre na nuvem: o cofre novo já nasce sincronizado (US2-5). */
  const [uploadAfter, setUploadAfter] = useState(false);

  const tooShort = Array.from(password).length < MIN_LENGTH;
  const mismatch = confirmation.length > 0 && confirmation !== password;

  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    if (tooShort || password !== confirmation) return;
    setBusy(true);
    setError(null);
    const res = await create(password, confirmation);
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (uploadAfter) {
      const err = await startSync('upload');
      if (err) toastError(err);
    }
  }

  if (cloud)
    return (
      <div className={s.fullscreen}>
        <OpenFromCloud
          onBack={() => {
            setCloud(false);
          }}
          onCreateNew={() => {
            setCloud(false);
            setUploadAfter(true);
          }}
        />
      </div>
    );

  return (
    <div className={s.fullscreen}>
      <form
        className={`${s.card} raised glass-edge`}
        autoComplete="off"
        onSubmit={(e) => void submit(e)}
      >
        <div className={s.brand}>
          <Logo size={44} />
        </div>
        <h1 className={s.title}>{t.vault.createTitle}</h1>
        <p className={s.intro}>{t.vault.createIntro}</p>
        <div className={s.notice} role="note">
          <WarningIcon className={s.noticeIcon} />
          <div>
            <strong>{t.vault.noRecoveryTitle}</strong>
            <p>{t.vault.noRecovery}</p>
          </div>
        </div>
        <TextField
          label={t.vault.password}
          secret
          autoFocus
          value={password}
          hint={t.vault.minLength}
          error={password.length > 0 && tooShort ? t.vault.minLength : null}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <TextField
          label={t.vault.confirmation}
          secret
          value={confirmation}
          error={mismatch ? t.vault.mismatch : null}
          onChange={(e) => {
            setConfirmation(e.target.value);
          }}
        />
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div className={s.actions}>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || tooShort || password !== confirmation}
          >
            {busy ? t.vault.creating : t.vault.createAction}
          </Button>
        </div>
        {syncAvailable && !uploadAfter && (
          <button
            type="button"
            className={s.linkButton}
            data-testid="open-from-cloud"
            onClick={() => {
              setCloud(true);
            }}
          >
            <CloudIcon width={14} height={14} /> {t.sync.openFromCloud.choose}
          </button>
        )}
      </form>
    </div>
  );
}

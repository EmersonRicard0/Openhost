// Primeira tela sem cofre: "Usar meu cofre do Google Drive" (specs/008, FR-813).
import { useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { cancelConnect, connectDrive, useSync } from '../../stores/sync';
import { Button } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { TextField } from '../../ui/TextField';
import { CloudIcon } from '../../ui/icons';
import s from '../vault/vault.module.css';

type Step = { kind: 'connect' } | { kind: 'password'; email: string } | { kind: 'empty' };

/**
 * Conecta a conta e abre o cofre da nuvem com a senha mestra. Senha errada não grava nada; conta
 * sem cofre leva de volta à criação com `onCreateNew`, que já nasce sincronizado.
 */
export function OpenFromCloud({
  onBack,
  onCreateNew,
}: {
  onBack: () => void;
  onCreateNew: () => void;
}) {
  const to = t.sync.openFromCloud;
  const connecting = useSync((st) => st.connecting);
  const [step, setStep] = useState<Step>({ kind: 'connect' });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = () => {
    setError(null);
    void connectDrive().then((res) => {
      if (!res.ok) {
        if (res.error.code !== 'SYNC_CANCELLED') setError(res.error.message);
        return;
      }
      setStep(
        res.value.cloudHasVault ? { kind: 'password', email: res.value.email } : { kind: 'empty' },
      );
    });
  };

  async function open(e: React.SubmitEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    // Sucesso troca o estado do cofre e o app sai desta tela sozinho.
    const res = await window.shellvault.sync.openFromCloud(password);
    setBusy(false);
    if (res.ok) return;
    if (res.error.code === 'CLOUD_EMPTY') setStep({ kind: 'empty' });
    else setError(res.error.message);
  }

  return (
    <form
      className={`${s.card} raised glass-edge`}
      autoComplete="off"
      onSubmit={(e) => void open(e)}
    >
      <h1 className={s.title}>{to.title}</h1>
      {step.kind === 'connect' && (
        <>
          <p className={s.intro}>{t.sync.intro}</p>
          {connecting ? (
            <div className={s.actions} role="status">
              <Spinner />
              <span className={s.intro}>{t.sync.waiting}</span>
              <Button onClick={() => void cancelConnect()}>{t.sync.cancel}</Button>
            </div>
          ) : (
            <div className={s.actions}>
              <Button onClick={onBack}>{t.common.back}</Button>
              <Button variant="primary" onClick={connect} data-testid="sync-open-connect">
                <CloudIcon />
                {t.sync.connect}
              </Button>
            </div>
          )}
        </>
      )}
      {step.kind === 'password' && (
        <>
          <p className={s.intro}>{t.sync.account(step.email)}</p>
          <TextField
            label={to.password}
            secret
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          <div className={s.actions}>
            <Button onClick={onBack}>{t.common.back}</Button>
            <Button type="submit" variant="primary" disabled={!password || busy}>
              {to.open}
            </Button>
          </div>
        </>
      )}
      {step.kind === 'empty' && (
        <>
          <p className={s.intro} role="status">
            {to.empty}
          </p>
          <div className={s.actions}>
            <Button onClick={onBack}>{t.common.back}</Button>
            <Button variant="primary" onClick={onCreateNew}>
              {to.createNew}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

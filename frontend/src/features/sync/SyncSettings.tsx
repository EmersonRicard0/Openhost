// Configurações → Sincronização (specs/008, FR-801, FR-809, FR-819).
import { useState } from 'react';
import type { SyncInfo } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import {
  cancelConnect,
  connectDrive,
  setDeviceName,
  startSync,
  syncNow,
  useSync,
} from '../../stores/sync';
import { useVault } from '../../stores/vault';
import { Button } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { TextField } from '../../ui/TextField';
import { toastError, toastInfo } from '../../ui/Toast';
import { Group } from '../settings/Group';
import s from '../settings/settings.module.css';
import { DisconnectDialog } from './DisconnectDialog';
import { StartChoiceDialog } from './StartChoiceDialog';

/** Frase do estado atual; erro tem prioridade e explica a causa. */
export function stateText(info: SyncInfo): string {
  const ts = t.sync.state;
  if (info.state === 'error') return info.reason ? t.sync.failed[info.reason] : t.sync.failed.auth;
  if (info.state === 'pending') return ts.pending(info.pending);
  return ts[info.state];
}

/** Login no navegador e, conforme a nuvem, envio do cofre ou escolha de juntar/substituir. */
function useConnectFlow() {
  const [choice, setChoice] = useState<string | null>(null);
  const connect = () =>
    void connectDrive().then(async (res) => {
      if (!res.ok) {
        if (res.error.code !== 'SYNC_CANCELLED') toastError(res.error);
        return;
      }
      if (res.value.cloudHasVault) {
        setChoice(res.value.email);
        return;
      }
      const err = await startSync('upload');
      if (err) toastError(err);
      else toastInfo(t.sync.synced);
    });
  return {
    choice,
    closeChoice: () => {
      setChoice(null);
    },
    connect,
  };
}

export function SyncSection() {
  const info = useSync((st) => st.info);
  const connecting = useSync((st) => st.connecting);
  const unlocked = useVault((v) => v.status?.state === 'unlocked');
  const { choice, closeChoice, connect } = useConnectFlow();
  const [disconnecting, setDisconnecting] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!info) return null;
  if (!info.available) return <p className={s.notice}>{t.sync.unavailable}</p>;
  if (!unlocked) return <p className={s.notice}>{t.sync.locked}</p>;

  const connected = info.state !== 'off';
  const lostAccess =
    info.state === 'error' && (info.reason === 'auth' || info.reason === 'removed');

  return (
    <>
      {!connected ? (
        <Group>
          <p>{t.sync.intro}</p>
          {connecting ? (
            <div className={s.actions} role="status">
              <Spinner />
              <span>{t.sync.waiting}</span>
              <Button onClick={() => void cancelConnect()}>{t.sync.cancel}</Button>
            </div>
          ) : (
            <div className={s.actions}>
              <Button variant="primary" onClick={connect} data-testid="sync-connect">
                {t.sync.connect}
              </Button>
            </div>
          )}
        </Group>
      ) : (
        <>
          <Group>
            {info.email && <p data-testid="sync-account">{t.sync.account(info.email)}</p>}
            <p role="status" data-sync-state={info.state}>
              {stateText(info)}
            </p>
            <p className={s.hint}>
              {info.lastSync
                ? t.sync.lastSync(new Date(info.lastSync).toLocaleString('pt-BR'))
                : t.sync.never}
            </p>
            <div className={s.actions}>
              {lostAccess ? (
                <Button variant="primary" onClick={connect} disabled={connecting}>
                  {t.sync.reconnect}
                </Button>
              ) : (
                <Button
                  disabled={busy || info.state === 'syncing'}
                  onClick={() => {
                    setBusy(true);
                    void syncNow().then((err) => {
                      setBusy(false);
                      if (err) toastError(err);
                    });
                  }}
                >
                  {t.sync.syncNow}
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => {
                  setDisconnecting(true);
                }}
              >
                {t.sync.disconnect}
              </Button>
            </div>
          </Group>
          <DeviceName key={info.deviceName ?? ''} saved={info.deviceName ?? ''} />
        </>
      )}
      {choice && <StartChoiceDialog email={choice} onClose={closeChoice} />}
      {disconnecting && (
        <DisconnectDialog
          onClose={() => {
            setDisconnecting(false);
          }}
        />
      )}
    </>
  );
}

/** Nome do computador no histórico; grava ao sair do campo. A `key` reinicia ao mudar fora. */
function DeviceName({ saved }: { saved: string }) {
  const [name, setName] = useState(saved);
  const trimmed = name.trim();
  const invalid = trimmed.length === 0 || trimmed.length > 64;

  return (
    <Group>
      <TextField
        label={t.sync.device}
        hint={t.sync.deviceHint}
        value={name}
        maxLength={64}
        error={invalid ? '1–64' : null}
        onChange={(e) => {
          setName(e.target.value);
        }}
        onBlur={() => {
          if (invalid || trimmed === saved) return;
          void setDeviceName(trimmed).then((err) => {
            if (err) toastError(err);
          });
        }}
      />
    </Group>
  );
}

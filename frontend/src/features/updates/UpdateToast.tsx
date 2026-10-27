// Aviso de versão nova (specs/007, FR-706–FR-715): não bloqueia nem tira o foco do terminal.
import { useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { isLive, useSessions } from '../../stores/sessions';
import { remindLater, skipVersion, useUpdates } from '../../stores/updates';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { CloseIcon, CopyIcon } from '../../ui/icons';
import { toastError } from '../../ui/Toast';
import { focusTerminal } from '../terminal/terminalRegistry';
import { Notes } from './Notes';
import s from './updates.module.css';

/** Chama a ponte e mostra o erro, se houver. */
async function run(action: () => Promise<{ ok: boolean; error?: unknown }>): Promise<void> {
  const res = await action();
  if (!res.ok && res.error) toastError(res.error as Parameters<typeof toastError>[0]);
}

/** Depois de um clique no aviso, o teclado volta para o terminal ativo. */
function backToTerminal(): void {
  const id = useSessions.getState().activeId;
  if (id) focusTerminal(id);
}

export function UpdateToast() {
  const info = useUpdates((u) => u.info);
  const open = useUpdates((u) => u.open);
  const setOpen = useUpdates((u) => u.setOpen);
  const lastResult = useUpdates((u) => u.lastResult);
  const dismissResult = useUpdates((u) => u.dismissResult);
  const liveSessions = useSessions((st) => st.tabs.filter((tb) => isLive(tb.state)).length);
  const [notes, setNotes] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [onQuit, setOnQuit] = useState(false);
  const [copied, setCopied] = useState(false);
  const api = window.shellvault.updates;

  if (lastResult && !(open && info?.latest)) {
    return (
      <div className={`${s.toast} raised`} role="status" data-update-result={lastResult.status}>
        <p className={s.message}>
          {lastResult.status === 'ok'
            ? t.updates.resultOk(lastResult.version)
            : t.updates.resultFailed(lastResult.version)}
        </p>
        <Button variant="ghost" iconOnly aria-label={t.updates.close} onClick={dismissResult}>
          <CloseIcon width={12} height={12} />
        </Button>
      </div>
    );
  }

  if (!open || !info?.latest) return null;
  const version = info.latest;
  const percent =
    info.progress && info.progress.total > 0
      ? Math.floor((info.progress.received / info.progress.total) * 100)
      : 0;

  const restart = () => {
    if (liveSessions > 0) setConfirm(true);
    else void run(() => api.restartNow());
  };

  const body = (() => {
    switch (info.state) {
      case 'downloading':
        return (
          <>
            <p className={s.message}>{t.updates.downloading(percent)}</p>
            <progress className={s.progress} value={percent} max={100} />
            <div className={s.actions}>
              <Button onClick={() => void run(() => api.cancel())}>{t.updates.cancel}</Button>
            </div>
          </>
        );
      case 'verifying':
      case 'applying':
        return <p className={s.message}>{t.updates.verifying}</p>;
      case 'ready':
        if (!info.oneClick)
          return (
            <>
              <p className={s.title}>{t.updates.manualReady(version)}</p>
              <p className={s.message}>{t.updates.manualHint}</p>
              {info.manualCommand && <code className={s.command}>{info.manualCommand}</code>}
              <div className={s.actions}>
                {info.manualCommand && (
                  <Button
                    onClick={() => {
                      void navigator.clipboard.writeText(info.manualCommand ?? '').then(() => {
                        setCopied(true);
                      });
                    }}
                  >
                    <CopyIcon />
                    {copied ? t.updates.commandCopied : t.updates.copyCommand}
                  </Button>
                )}
                <Button onClick={() => void run(() => api.openDownloadFolder())}>
                  {t.updates.openFolder}
                </Button>
              </div>
            </>
          );
        return (
          <>
            <p className={s.title}>{t.updates.ready(version)}</p>
            {onQuit && <p className={s.message}>{t.updates.applyOnQuitDone}</p>}
            <div className={s.actions}>
              <Button variant="primary" onClick={restart}>
                {t.updates.restart}
              </Button>
              {!onQuit && (
                <Button
                  onClick={() =>
                    void run(() => api.applyOnQuit()).then(() => {
                      setOnQuit(true);
                    })
                  }
                >
                  {t.updates.applyOnQuit}
                </Button>
              )}
            </div>
          </>
        );
      case 'failed':
        return (
          <>
            <p className={s.message} role="alert">
              {info.reason ? t.updates.failed[info.reason] : t.updates.failed.install}
            </p>
            <div className={s.actions}>
              <Button variant="primary" onClick={() => void run(() => api.download())}>
                {t.updates.retry}
              </Button>
              <Button onClick={() => void remindLater()}>{t.updates.remind}</Button>
            </div>
          </>
        );
      default:
        return (
          <>
            <p className={s.title}>
              {t.updates.available(version)}
              {info.prerelease && <span className={s.badge}>{t.updates.prerelease}</span>}
            </p>
            {info.notes && (
              <>
                <button
                  type="button"
                  className={s.notesToggle}
                  aria-expanded={notes}
                  onClick={() => {
                    setNotes((v) => !v);
                  }}
                >
                  {notes ? t.updates.hideNotes : t.updates.showNotes}
                </button>
                {notes && <Notes text={info.notes} />}
              </>
            )}
            <div className={s.actions}>
              <Button variant="primary" onClick={() => void run(() => api.download())}>
                {info.oneClick ? t.updates.update : t.updates.download}
              </Button>
              <Button onClick={() => void remindLater().then(backToTerminal)}>
                {t.updates.remind}
              </Button>
              <Button variant="ghost" onClick={() => void skipVersion().then(backToTerminal)}>
                {t.updates.skip}
              </Button>
            </div>
          </>
        );
    }
  })();

  return (
    <>
      <section
        className={`${s.toast} raised`}
        role="status"
        aria-label={t.updates.available(version)}
        data-update-state={info.state}
      >
        <div className={s.body}>{body}</div>
        <Button
          variant="ghost"
          iconOnly
          aria-label={t.updates.close}
          onClick={() => {
            setOpen(false);
            backToTerminal();
          }}
        >
          <CloseIcon width={12} height={12} />
        </Button>
      </section>
      {confirm && (
        <Dialog
          title={t.updates.restartConfirm.title}
          onClose={() => {
            setConfirm(false);
          }}
          onSubmit={() => {
            setConfirm(false);
            void run(() => api.restartNow());
          }}
          actions={
            <>
              <Button
                onClick={() => {
                  setConfirm(false);
                }}
              >
                {t.common.cancel}
              </Button>
              {!onQuit && (
                <Button
                  onClick={() => {
                    setConfirm(false);
                    void run(() => api.applyOnQuit()).then(() => {
                      setOnQuit(true);
                    });
                  }}
                >
                  {t.updates.applyOnQuit}
                </Button>
              )}
              <Button type="submit" variant="primary" autoFocus>
                {t.updates.restartConfirm.confirm}
              </Button>
            </>
          }
        >
          <p style={{ margin: 0 }}>{t.updates.restartConfirm.message(liveSessions)}</p>
        </Dialog>
      )}
    </>
  );
}

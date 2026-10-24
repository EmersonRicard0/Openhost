// Indicador na barra de título: encaminhamentos abertos, visíveis e desativáveis
// mesmo com o cofre bloqueado (FR-003).
import { useState } from 'react';
import { t } from '../../i18n/pt-BR';
import { useForwards } from '../../stores/forwards';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { ForwardIcon } from '../../ui/icons';
import { toastError } from '../../ui/Toast';
import { describeRule, statusText } from './format';
import s from './forwarding.module.css';

export function ForwardsIndicator() {
  const active = useForwards((st) => st.active);
  const [open, setOpen] = useState(false);
  const running = active.filter((a) => a.status === 'active').length;
  if (active.length === 0 && !open) return null;

  async function deactivate(ruleId: string) {
    const res = await window.shellvault.forwards.deactivate(ruleId);
    if (!res.ok) toastError(res.error);
  }

  return (
    <>
      <Button
        variant="ghost"
        className={`no-drag ${s.indicator}`}
        aria-label={t.forwarding.activeCount(running)}
        title={t.forwarding.activeCount(running)}
        onClick={() => {
          setOpen(true);
        }}
      >
        <ForwardIcon />
        <span className={s.badge}>{running}</span>
      </Button>
      {open && (
        <Dialog
          title={t.forwarding.activeTitle}
          onClose={() => {
            setOpen(false);
          }}
          width={600}
          actions={
            <Button
              onClick={() => {
                setOpen(false);
              }}
            >
              {t.common.close}
            </Button>
          }
        >
          {active.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              {t.forwarding.activeCount(0)}
            </p>
          ) : (
            <ul className={s.rules}>
              {active.map((a) => (
                <li key={a.ruleId} className={s.rule} aria-label={describeRule(a)}>
                  <div className={s.ruleText}>
                    <span className={s.ruleLabel}>{a.hostLabel}</span>
                    <span className={s.mono}>{describeRule(a)}</span>
                  </div>
                  <span className={s.status} data-status={a.status} role="status">
                    {statusText(a)}
                  </span>
                  <Button onClick={() => void deactivate(a.ruleId)}>
                    {t.forwarding.deactivate}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </>
  );
}

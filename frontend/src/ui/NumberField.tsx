// Campo numérico próprio: botões −/+ e setas do teclado, sem as setinhas nativas do Chromium.
// O texto continua livre enquanto se digita; quem usa valida a faixa (mensagem em `error`).
import { useId } from 'react';
import { t } from '../i18n/pt-BR';
import { MinusIcon, PlusIcon } from './icons';
import s from './ui.module.css';

export interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string | undefined;
  error?: string | null | undefined;
  /** Unidade mostrada depois do número (ex.: "s", "px"). */
  unit?: string;
  disabled?: boolean;
  /** `false` tira os botões −/+ (porta, specs/009 FR-921); as setas do teclado continuam. */
  steppers?: boolean;
  /** Seleciona o valor inteiro ao receber o foco, para digitar por cima. */
  selectOnFocus?: boolean;
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
  error,
  unit,
  disabled,
  steppers = true,
  selectOnFocus = false,
}: NumberFieldProps) {
  const id = useId();
  const parsed = Number(value);
  const numeric = value.trim() !== '' && Number.isFinite(parsed);

  function bump(direction: 1 | -1) {
    const base = numeric ? parsed : min;
    const next = Math.min(max, Math.max(min, base + direction * step));
    onChange(String(Math.round(next * 1000) / 1000));
  }

  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={id}>
        {label}
      </label>
      <div className={`${s.inputWrap} ${s.numberWrap} ${steppers ? '' : s.numberPlain}`}>
        {steppers && (
          <button
            type="button"
            tabIndex={-1}
            className={s.stepper}
            aria-label={t.common.decrease}
            disabled={disabled || (numeric && parsed <= min)}
            onClick={() => {
              bump(-1);
            }}
          >
            <MinusIcon />
          </button>
        )}
        <input
          id={id}
          className={`${s.input} ${s.numberInput}`}
          inputMode="decimal"
          role="spinbutton"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={numeric ? parsed : undefined}
          aria-invalid={error ? true : undefined}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onFocus={
            selectOnFocus
              ? (e) => {
                  e.currentTarget.select();
                }
              : undefined
          }
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              bump(e.key === 'ArrowUp' ? 1 : -1);
            }
          }}
        />
        {unit && <span className={s.unit}>{unit}</span>}
        {steppers && (
          <button
            type="button"
            tabIndex={-1}
            className={s.stepper}
            aria-label={t.common.increase}
            disabled={disabled || (numeric && parsed >= max)}
            onClick={() => {
              bump(1);
            }}
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {error ? (
        <span className={s.error} role="alert">
          {error}
        </span>
      ) : (
        hint && <span className={s.hint}>{hint}</span>
      )}
    </div>
  );
}

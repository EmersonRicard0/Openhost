// Lista de ambientes de host em Configurações → Aparência (specs/009, FR-902).
import { useState } from 'react';
import type { Environment, EnvironmentColor } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useUi } from '../../stores/ui';
import { useVault } from '../../stores/vault';
import { ENVIRONMENT_COLORS, environmentColor } from '../../theme/environments';
import { Button } from '../../ui/Button';
import { CloseIcon, PlusIcon } from '../../ui/icons';
import { Select } from '../../ui/Select';
import { toastError } from '../../ui/Toast';
import { environmentsOf, MAX_ENVIRONMENTS } from '../hosts/environment';
import hosts from '../hosts/hosts.module.css';
import s from './settings.module.css';

const MAX_NAME = 24;

/** Nome válido: 1–24 caracteres e único sem diferenciar maiúsculas. */
function nameProblem(list: readonly Environment[], index: number, name: string): string | null {
  const clean = name.trim();
  if (!clean || Array.from(clean).length > MAX_NAME) return t.environments.nameInvalid;
  const lower = clean.toLocaleLowerCase('pt-BR');
  if (list.some((e, i) => i !== index && e.name.toLocaleLowerCase('pt-BR') === lower))
    return t.environments.nameTaken;
  return null;
}

export function EnvironmentsEditor() {
  const settings = useVault((v) => v.settings);
  const updateSettings = useVault((v) => v.updateSettings);
  const dark = useUi((u) => u.dark);
  const list = environmentsOf(settings);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});

  function save(next: Environment[]) {
    void updateSettings({ environments: next }).then((res) => {
      if (!res.ok) toastError(res.error);
    });
  }

  function commitName(index: number) {
    const draft = drafts[index];
    const current = list[index];
    if (draft === undefined || !current) return;
    const problem = nameProblem(list, index, draft);
    setErrors((e) => ({ ...e, [index]: problem ?? '' }));
    if (problem) return;
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== String(index))));
    if (draft.trim() !== current.name)
      save(list.map((e, i) => (i === index ? { ...e, name: draft.trim() } : e)));
  }

  function add() {
    let n = list.length + 1;
    while (list.some((e) => e.name === t.environments.newName(n))) n++;
    const color = ENVIRONMENT_COLORS[list.length % ENVIRONMENT_COLORS.length] ?? 'slate';
    save([...list, { id: '', name: t.environments.newName(n), color }]);
  }

  const colorOptions = ENVIRONMENT_COLORS.map((color) => ({
    value: color,
    label: t.environments.colors[color],
    icon: (
      <span
        className={hosts.environmentDot}
        style={{ ['--environment' as string]: environmentColor(color, dark) }}
      />
    ),
  }));

  return (
    <div className={s.environmentList} role="group" aria-label={t.environments.title}>
      <p className={s.hint}>{t.environments.hint}</p>
      {list.map((env, index) => (
        <div key={env.id || `novo-${String(index)}`} className={s.environmentRow}>
          <div className={s.environmentName}>
            <input
              className={s.environmentInput}
              aria-label={t.environments.name(env.name)}
              aria-invalid={errors[index] ? true : undefined}
              maxLength={MAX_NAME}
              value={drafts[index] ?? env.name}
              onChange={(e) => {
                setDrafts((d) => ({ ...d, [index]: e.target.value }));
              }}
              onBlur={() => {
                commitName(index);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            {errors[index] && (
              <span className={s.environmentError} role="alert">
                {errors[index]}
              </span>
            )}
          </div>
          <Select<EnvironmentColor>
            label={t.environments.color(env.name)}
            hideLabel
            value={env.color}
            options={colorOptions}
            onChange={(color) => {
              save(list.map((e, i) => (i === index ? { ...e, color } : e)));
            }}
          />
          <Button
            variant="ghost"
            iconOnly
            aria-label={t.environments.remove(env.name)}
            onClick={() => {
              save(list.filter((_, i) => i !== index));
            }}
          >
            <CloseIcon width={12} height={12} />
          </Button>
        </div>
      ))}
      <Button
        style={{ alignSelf: 'flex-start' }}
        disabled={list.length >= MAX_ENVIRONMENTS}
        onClick={add}
      >
        <PlusIcon width={14} height={14} />
        {t.environments.add}
      </Button>
    </div>
  );
}

// Exportar hosts (FR-324 a FR-329). Chaves só no formato do OpenHost, com senha mestra e uma
// senha para o arquivo, que então sai inteiro criptografado.
import { useEffect, useState } from 'react';
import type { ExportCount, ExportFormat, ExportScope } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { toastInfo } from '../../ui/Toast';
import { groupOptions } from './options';
import s from './importexport.module.css';

const ex = t.importExport.exportDialog;
const MIN_PASSWORD = 8;

export interface ExportDialogProps {
  /** Grupo já escolhido quando o diálogo vem do menu de um grupo. */
  groupId?: string | null;
  /** Hosts já escolhidos quando o diálogo vem do menu de um host. */
  hostIds?: readonly string[];
  onClose: () => void;
}

type ScopeKind = ExportScope['kind'];

export function ExportDialog({ groupId = null, hostIds = [], onClose }: ExportDialogProps) {
  const groups = useHosts((h) => h.groups);
  const [format, setFormat] = useState<ExportFormat>('openhost');
  const [scopeKind, setScopeKind] = useState<ScopeKind>(
    hostIds.length > 0 ? 'hosts' : groupId ? 'group' : 'all',
  );
  const [group, setGroup] = useState<string>(groupId ?? groups[0]?.id ?? '');
  const [count, setCount] = useState<ExportCount | null>(null);
  const [includeKeys, setIncludeKeys] = useState(false);
  const [master, setMaster] = useState('');
  const [filePassword, setFilePassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sshMode, setSshMode] = useState<'newFile' | 'append'>('newFile');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scope: ExportScope =
    scopeKind === 'hosts' && hostIds.length > 0
      ? { kind: 'hosts', hostIds: [...hostIds] }
      : scopeKind === 'group' && group
        ? { kind: 'group', groupId: group }
        : { kind: 'all' };
  // Chave estável do escopo: a contagem só é refeita quando ele muda de fato.
  const scopeKey = JSON.stringify(scope);

  useEffect(() => {
    let alive = true;
    void window.shellvault.exports.count(JSON.parse(scopeKey) as ExportScope).then((res) => {
      if (alive && res.ok) setCount(res.value);
    });
    return () => {
      alive = false;
    };
  }, [scopeKey]);

  const withKeys = format === 'openhost' && includeKeys;
  const tooShort = withKeys && Array.from(filePassword).length < MIN_PASSWORD;
  const mismatch = withKeys && confirmation.length > 0 && confirmation !== filePassword;
  const valid =
    (count?.hosts ?? 0) > 0 &&
    (!withKeys || (master.length > 0 && !tooShort && filePassword === confirmation));

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await window.shellvault.exports.export({
      format,
      scope,
      includeKeys: withKeys,
      ...(withKeys ? { masterPassword: master, filePassword } : {}),
      ...(format === 'openssh' ? { sshConfigMode: sshMode } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    if (!res.value) return; // diálogo de salvar cancelado
    toastInfo(ex.saved(res.value.path));
    onClose();
  }

  return (
    <Dialog
      title={ex.title}
      width={520}
      onClose={onClose}
      onSubmit={() => void submit()}
      actions={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={busy || !valid}>
            {ex.submit}
          </Button>
        </>
      }
    >
      <Segmented<ExportFormat>
        label={ex.format}
        value={format}
        options={(['openhost', 'openssh', 'csv'] as const).map((value) => ({
          value,
          label: ex.formats[value],
        }))}
        hint={ex.formatHints[format]}
        onChange={setFormat}
      />
      <Segmented<ScopeKind>
        label={ex.scope}
        value={scopeKind}
        options={[
          ...(hostIds.length > 0
            ? [{ value: 'hosts' as const, label: ex.scopeHosts(hostIds.length) }]
            : []),
          { value: 'all', label: ex.scopeAll },
          ...(groups.length > 0 ? [{ value: 'group' as const, label: ex.scopeGroup }] : []),
        ]}
        onChange={setScopeKind}
      />
      {scopeKind === 'group' && groups.length > 0 && (
        <Select
          label={ex.group}
          value={group}
          options={groupOptions(groups, '').slice(1)}
          onChange={setGroup}
        />
      )}
      {count && <p className={s.hint}>{ex.count(count.hosts, count.groups)}</p>}

      {format === 'openhost' && (
        <>
          <Checkbox
            label={ex.includeKeys}
            hint={count && count.keys > 0 ? ex.includeKeysHint(count.keys) : undefined}
            checked={includeKeys}
            disabled={!count || count.keys === 0}
            onChange={(e) => {
              setIncludeKeys(e.target.checked);
            }}
          />
          {withKeys ? (
            <div className={s.stack}>
              <TextField
                label={ex.masterPassword}
                secret
                autoComplete="off"
                value={master}
                onChange={(e) => {
                  setMaster(e.target.value);
                }}
              />
              <TextField
                label={ex.filePassword}
                secret
                autoComplete="new-password"
                value={filePassword}
                hint={t.vault.minLength}
                error={filePassword.length > 0 && tooShort ? t.vault.minLength : null}
                onChange={(e) => {
                  setFilePassword(e.target.value);
                }}
              />
              <TextField
                label={ex.filePasswordConfirm}
                secret
                autoComplete="new-password"
                value={confirmation}
                error={mismatch ? ex.mismatch : null}
                onChange={(e) => {
                  setConfirmation(e.target.value);
                }}
              />
            </div>
          ) : (
            <p className={s.notice}>{ex.plainWarning}</p>
          )}
        </>
      )}

      {format === 'openssh' && (
        <Segmented<'newFile' | 'append'>
          label={ex.sshConfigMode}
          value={sshMode}
          options={[
            { value: 'newFile', label: ex.sshNewFile },
            { value: 'append', label: ex.sshAppend },
          ]}
          {...(sshMode === 'append' ? { hint: ex.sshAppendHint } : {})}
          onChange={setSshMode}
        />
      )}

      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </Dialog>
  );
}

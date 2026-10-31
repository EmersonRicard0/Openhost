// Criar/editar host (FR-007).
import { useEffect, useState } from 'react';
import type { AuthMethod, HostInput, HostView, OsId } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { useProfiles } from '../../stores/profiles';
import { useVault } from '../../stores/vault';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Dialog } from '../../ui/Dialog';
import { NumberField } from '../../ui/NumberField';
import { Select } from '../../ui/Select';
import { TextAreaField, TextField } from '../../ui/TextField';
import { WarningIcon } from '../../ui/icons';
import { OS_OPTIONS, OsLogo, osLabel } from '../../ui/osIcons';
import { toastError } from '../../ui/Toast';
import { useUi } from '../../stores/ui';
import { environmentColor } from '../../theme/environments';
import { environmentsOf } from './environment';
import { MAX_NOTES, runeCount } from './tags';
import { TagInput } from './TagInput';
import { HostTerminalDialog } from './HostTerminalDialog';
import s from './hosts.module.css';

const NEW_PASSWORD = '__new__';
const NONE = '';

const METHODS: { value: AuthMethod; label: string }[] = [
  { value: 'password', label: t.hosts.authPassword },
  { value: 'key', label: t.hosts.authKey },
  { value: 'ask', label: t.hosts.authAsk },
  { value: 'agent', label: t.hosts.authAgent },
];

export interface HostFormProps {
  host: HostView | null;
  onClose: () => void;
  onManageCredentials: () => void;
}

export function HostForm({ host, onClose, onManageCredentials }: HostFormProps) {
  const { credentials, reload } = useHosts();
  const [label, setLabel] = useState(host?.label ?? '');
  const [address, setAddress] = useState(host?.address ?? '');
  const [port, setPort] = useState(String(host?.port ?? 22));
  const [username, setUsername] = useState(host?.username ?? '');
  const [method, setMethod] = useState<AuthMethod>(host?.authMethod ?? 'password');
  const [credentialId, setCredentialId] = useState<string>(
    host?.credentialId ?? (host ? NONE : NEW_PASSWORD),
  );
  const [newPassword, setNewPassword] = useState('');
  // Host novo começa com o padrão da seção Conexão até o usuário mexer no campo.
  const legacyDefault = useVault((v) => v.settings?.legacyDefault ?? false);
  const loadVaultSettings = useVault((v) => v.loadSettings);
  const [osIcon, setOsIcon] = useState<OsId | 'auto'>(host?.osIcon ?? 'auto');
  const [legacyChoice, setLegacy] = useState<boolean | null>(host?.legacyAlgorithms ?? null);
  const legacy = legacyChoice ?? legacyDefault;
  const environments = environmentsOf(useVault((v) => v.settings));
  const dark = useUi((u) => u.dark);
  const [environmentId, setEnvironmentId] = useState(host?.environmentId ?? NONE);
  const [tags, setTags] = useState<string[]>(host?.tags ?? []);
  const [notes, setNotes] = useState(host?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const hasOwnProfile = useProfiles((p) => (host ? Boolean(p.overrides[host.id]) : false));
  const loadOverride = useProfiles((p) => p.loadOverride);
  const setOverride = useProfiles((p) => p.setOverride);
  const hostId = host?.id;

  useEffect(() => {
    if (hostId) void loadOverride(hostId);
  }, [hostId, loadOverride]);

  useEffect(() => {
    void loadVaultSettings();
  }, [loadVaultSettings]);

  const kind = method === 'key' ? 'key' : 'password';
  const options = [
    { value: NONE, label: t.hosts.noCredential },
    ...(method === 'password'
      ? [{ value: NEW_PASSWORD, label: t.hosts.newPasswordCredential }]
      : []),
    ...credentials.filter((c) => c.kind === kind).map((c) => ({ value: c.id, label: c.name })),
  ];
  const selected = options.some((o) => o.value === credentialId) ? credentialId : NONE;
  const portNumber = Number(port);
  const portValid = Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535;
  const needsCredential = method === 'password' || method === 'key';
  const valid =
    label.trim() !== '' &&
    address.trim() !== '' &&
    username.trim() !== '' &&
    portValid &&
    runeCount(notes) <= MAX_NOTES &&
    (!needsCredential || (selected === NEW_PASSWORD ? newPassword !== '' : selected !== NONE));

  async function submit() {
    if (!valid) return;
    setBusy(true);
    let credId: string | null = needsCredential ? selected : null;
    if (credId === NEW_PASSWORD) {
      const res = await window.shellvault.credentials.createPassword(label.trim(), newPassword);
      if (!res.ok) {
        setBusy(false);
        toastError(res.error);
        return;
      }
      credId = res.value.id;
    }
    const input: HostInput = {
      label: label.trim(),
      address: address.trim(),
      port: portNumber,
      username: username.trim(),
      authMethod: method,
      credentialId: credId,
      groupId: host?.groupId ?? null,
      legacyAlgorithms: legacy,
      osIcon,
      environmentId: environments.some((e) => e.id === environmentId) ? environmentId : null,
      tags,
      notes,
    };
    const res = host
      ? await window.shellvault.hosts.update(host.id, input)
      : await window.shellvault.hosts.create(input);
    setBusy(false);
    if (!res.ok) {
      toastError(res.error);
      return;
    }
    await reload();
    onClose();
  }

  return (
    <Dialog
      title={host ? t.hosts.edit : t.hosts.add}
      onClose={onClose}
      onSubmit={() => void submit()}
      width={520}
      actions={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={busy || !valid}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <div className={s.form}>
        <TextField
          label={t.hosts.label}
          autoFocus
          maxLength={100}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
        />
        <Select
          label={t.hosts.osIcon}
          value={osIcon}
          options={[
            {
              value: 'auto',
              label: host?.detectedOs
                ? t.hosts.osIconAutoDetected(osLabel(host.detectedOs))
                : t.hosts.osIconAuto,
            },
            ...OS_OPTIONS.map((os) => ({
              value: os.id,
              label: os.label,
              icon: <OsLogo id={os.id} />,
            })),
          ]}
          onChange={setOsIcon}
        />
        <Select
          label={t.hosts.environment}
          value={environments.some((e) => e.id === environmentId) ? environmentId : NONE}
          options={[
            { value: NONE, label: t.hosts.environmentNone },
            ...environments.map((e) => ({
              value: e.id,
              label: e.name,
              icon: (
                <span
                  className={s.environmentDot}
                  style={{ ['--environment' as string]: environmentColor(e.color, dark) }}
                />
              ),
            })),
          ]}
          onChange={setEnvironmentId}
        />
        <div className={s.row}>
          <TextField
            label={t.hosts.address}
            hint={t.hosts.addressHint}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
            }}
          />
          <NumberField
            label={t.hosts.port}
            min={1}
            max={65535}
            value={port}
            error={portValid ? null : '1–65535'}
            onChange={setPort}
            steppers={false}
            selectOnFocus
          />
        </div>
        <TextField
          label={t.hosts.username}
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
          }}
        />
        <Select
          label={t.hosts.authMethod}
          value={method}
          options={METHODS}
          onChange={(v) => {
            setMethod(v);
          }}
        />
        {needsCredential && (
          <Select
            label={t.hosts.credential}
            value={selected}
            options={options}
            onChange={setCredentialId}
          />
        )}
        {method === 'agent' && <p className={s.hint}>{t.hosts.authAgentHint}</p>}
        {needsCredential && selected === NEW_PASSWORD && (
          <TextField
            label={t.credentials.password}
            secret
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
            }}
          />
        )}
        <Checkbox
          label={t.hosts.legacy}
          checked={legacy}
          onChange={(e) => {
            setLegacy(e.target.checked);
          }}
        />
        {legacy && (
          <div className={s.legacyWarning} role="note">
            <WarningIcon style={{ flex: 'none' }} />
            <p>{t.hosts.legacyHint}</p>
          </div>
        )}
        <TagInput tags={tags} onChange={setTags} />
        <TextAreaField
          label={t.hosts.notes}
          hint={t.hosts.notesCount(runeCount(notes))}
          error={runeCount(notes) > MAX_NOTES ? t.hosts.notesCount(runeCount(notes)) : null}
          rows={3}
          style={{ fontFamily: 'inherit', fontSize: 13, minHeight: 64 }}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
        {host && (
          <div className={s.terminalProfile} role="group" aria-label={t.hosts.terminalProfile}>
            <p>{hasOwnProfile ? t.hosts.terminalProfileOwn : t.hosts.terminalProfileGlobal}</p>
            <Button
              onClick={() => {
                setEditingProfile(true);
              }}
            >
              {hasOwnProfile ? t.hosts.terminalProfileEdit : t.hosts.terminalProfileCustomize}
            </Button>
            {hasOwnProfile && (
              <Button variant="ghost" onClick={() => void setOverride(host.id, null)}>
                {t.hosts.terminalProfileReset}
              </Button>
            )}
          </div>
        )}
        <Button variant="ghost" style={{ alignSelf: 'flex-start' }} onClick={onManageCredentials}>
          {t.hosts.manageCredentials}
        </Button>
      </div>
      {host && editingProfile && (
        <HostTerminalDialog
          hostId={host.id}
          hostLabel={host.label}
          onClose={() => {
            setEditingProfile(false);
          }}
        />
      )}
    </Dialog>
  );
}

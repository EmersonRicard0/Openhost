// Criar/editar host (FR-007).
import { useState } from 'react';
import type { AuthMethod, HostInput, HostView } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { toastError } from '../../ui/Toast';
import s from './hosts.module.css';

const NEW_PASSWORD = '__new__';
const NONE = '';

const METHODS: { value: AuthMethod; label: string }[] = [
  { value: 'password', label: t.hosts.authPassword },
  { value: 'key', label: t.hosts.authKey },
  { value: 'ask', label: t.hosts.authAsk },
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
  const [busy, setBusy] = useState(false);

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
  const needsCredential = method !== 'ask';
  const valid =
    label.trim() !== '' &&
    address.trim() !== '' &&
    username.trim() !== '' &&
    portValid &&
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
        <div className={s.row}>
          <TextField
            label={t.hosts.address}
            hint={t.hosts.addressHint}
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
            }}
          />
          <TextField
            label={t.hosts.port}
            type="number"
            min={1}
            max={65535}
            value={port}
            error={portValid ? null : '1–65535'}
            onChange={(e) => {
              setPort(e.target.value);
            }}
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
        <Button variant="ghost" style={{ alignSelf: 'flex-start' }} onClick={onManageCredentials}>
          {t.hosts.manageCredentials}
        </Button>
      </div>
    </Dialog>
  );
}

import { useEffect, useState } from 'react';
import type { ThemePreference } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useUi } from '../../stores/ui';
import { useVault } from '../../stores/vault';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Select } from '../../ui/Select';
import { TextField } from '../../ui/TextField';
import { toastError, toastInfo } from '../../ui/Toast';
import { ChangePasswordDialog } from '../vault/ChangePasswordDialog';
import { EraseVaultDialog } from '../vault/EraseVaultDialog';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: t.settings.themeSystem },
  { value: 'light', label: t.settings.themeLight },
  { value: 'dark', label: t.settings.themeDark },
];

function intIn(text: string, min: number, max: number): number | null {
  const n = Number(text);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const ui = useUi((u) => u.settings);
  const setUi = useUi((u) => u.setSettings);
  const { status, settings: vaultSettings, loadSettings, updateSettings } = useVault();
  const unlocked = status?.state === 'unlocked';

  const [theme, setTheme] = useState<ThemePreference>(ui?.theme ?? 'system');
  const [font, setFont] = useState(ui?.terminalFontFamily ?? '');
  const [fontSize, setFontSize] = useState(String(ui?.terminalFontSize ?? 14));
  const [autoLockOn, setAutoLockOn] = useState(true);
  const [autoLock, setAutoLock] = useState('15');
  const [timeout, setTimeoutText] = useState('15');
  const [sub, setSub] = useState<'password' | 'erase' | null>(null);

  useEffect(() => {
    if (unlocked) void loadSettings();
  }, [unlocked, loadSettings]);

  // Sincroniza o formulário quando as configurações do cofre chegam (ajuste durante a renderização).
  const [syncedFrom, setSyncedFrom] = useState<typeof vaultSettings>(null);
  if (vaultSettings && vaultSettings !== syncedFrom) {
    setSyncedFrom(vaultSettings);
    setAutoLockOn(vaultSettings.autoLockMinutes !== null);
    setAutoLock(String(vaultSettings.autoLockMinutes ?? 15));
    setTimeoutText(String(vaultSettings.connectTimeoutSeconds));
  }

  const fontSizeValue = intIn(fontSize, 8, 32);
  const autoLockValue = intIn(autoLock, 1, 120);
  const timeoutValue = intIn(timeout, 5, 120);
  const valid =
    fontSizeValue !== null &&
    font.trim().length > 0 &&
    (!unlocked || ((!autoLockOn || autoLockValue !== null) && timeoutValue !== null));

  async function save() {
    if (!valid) return;
    const uiRes = await window.shellvault.app.updateUiSettings({
      theme,
      terminalFontFamily: font.trim(),
      terminalFontSize: fontSizeValue,
    });
    if (!uiRes.ok) {
      toastError(uiRes.error);
      return;
    }
    setUi(uiRes.value);
    if (unlocked && timeoutValue !== null) {
      const res = await updateSettings({
        autoLockMinutes: autoLockOn ? autoLockValue : null,
        connectTimeoutSeconds: timeoutValue,
      });
      if (!res.ok) {
        toastError(res.error);
        return;
      }
    }
    toastInfo(t.settings.saved);
    onClose();
  }

  if (sub === 'password') {
    return (
      <ChangePasswordDialog
        onClose={() => {
          setSub(null);
        }}
      />
    );
  }
  if (sub === 'erase') return <EraseVaultDialog onClose={onClose} />;

  return (
    <Dialog
      title={t.settings.title}
      onClose={onClose}
      width={520}
      actions={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button variant="primary" disabled={!valid} onClick={() => void save()}>
            {t.common.save}
          </Button>
        </>
      }
    >
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 13 }}>{t.settings.appearanceSection}</h3>
        <Select
          label={t.settings.theme}
          value={theme}
          options={THEMES}
          onChange={(v) => {
            setTheme(v);
          }}
        />
        <TextField
          label={t.settings.font}
          value={font}
          onChange={(e) => {
            setFont(e.target.value);
          }}
        />
        <TextField
          label={t.settings.fontSize}
          type="number"
          min={8}
          max={32}
          value={fontSize}
          error={fontSizeValue === null ? '8–32' : null}
          onChange={(e) => {
            setFontSize(e.target.value);
          }}
        />
      </section>

      {unlocked && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 13 }}>{t.settings.vaultSection}</h3>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={autoLockOn}
              onChange={(e) => {
                setAutoLockOn(e.target.checked);
              }}
            />
            {t.settings.autoLock}
          </label>
          {autoLockOn && (
            <TextField
              label={t.settings.autoLockMinutes}
              type="number"
              min={1}
              max={120}
              value={autoLock}
              error={autoLockValue === null ? '1–120' : null}
              onChange={(e) => {
                setAutoLock(e.target.value);
              }}
            />
          )}
          <TextField
            label={t.settings.connectTimeout}
            type="number"
            min={5}
            max={120}
            value={timeout}
            error={timeoutValue === null ? '5–120' : null}
            onChange={(e) => {
              setTimeoutText(e.target.value);
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              onClick={() => {
                setSub('password');
              }}
            >
              {t.settings.changePassword}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setSub('erase');
              }}
            >
              {t.settings.eraseVault}
            </Button>
          </div>
        </section>
      )}
    </Dialog>
  );
}

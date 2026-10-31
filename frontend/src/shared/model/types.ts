// Tipos de entidades (data-model.md). Campos opcionais são representados por `null`.
import type { ErrorCode } from '../ipc/errors';

// --- Cofre -----------------------------------------------------------------

export type VaultState = 'nonexistent' | 'locked' | 'migratable' | 'unlocked' | 'unreadable';

export interface VaultStatus {
  state: VaultState;
  /** Só quando `state === "unreadable"`. */
  reason: 'corrupted' | 'unsupportedVersion' | null;
}

export interface VaultSettings {
  /** 1–120 minutos, ou `null` para desativado. */
  autoLockMinutes: number | null;
  /** 5–120 segundos. */
  connectTimeoutSeconds: number;
  /** 10–300 segundos; padrão 30. */
  keepaliveSeconds: number;
  /** Valor inicial de "algoritmos legados" em hosts novos. */
  legacyDefault: boolean;
  /** `$TERM` enviado no pedido de PTY. */
  term: TermType;
}

export type TermType = 'xterm-256color' | 'xterm' | 'vt100' | 'linux';

// --- Hosts, grupos, credenciais --------------------------------------------

export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
}

export type AuthMethod = 'password' | 'key' | 'ask' | 'agent';

export interface Host {
  id: string;
  label: string;
  address: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  credentialId: string | null;
  groupId: string | null;
  /** Aceita algoritmos fracos (equipamentos antigos, FR-121); mostrado com aviso. */
  legacyAlgorithms: boolean;
  /** Sistema detectado na conexão (FR-178); só o Go grava. */
  detectedOs?: OsId | null;
  /** Ícone escolhido no formulário; `auto` usa o detectado. */
  osIcon?: OsId | 'auto';
  createdAt: string;
  updatedAt: string;
}

/** Ids de sistema do data-model (FR-178), na mesma ordem do Go. */
export const OS_IDS = [
  'ubuntu',
  'debian',
  'centos',
  'rhel',
  'fedora',
  'rocky',
  'almalinux',
  'alpine',
  'arch',
  'opensuse',
  'oracle',
  'amazon',
  'linux',
  'freebsd',
  'openbsd',
  'windows',
  'macos',
  'mikrotik',
  'cisco',
  'huawei',
  'juniper',
  'hpe',
  'fortinet',
  'openwrt',
  'zte',
  'datacom',
  'hillstone',
] as const;

export type OsId = (typeof OS_IDS)[number];

export type HostInput = Omit<Host, 'id' | 'createdAt' | 'updatedAt' | 'detectedOs'>;

export interface HostView extends Host {
  credentialName: string | null;
}

export type CredentialKind = 'password' | 'key';

export type KeyType =
  'ssh-ed25519' | 'ecdsa-sha2-nistp256' | 'ecdsa-sha2-nistp384' | 'ecdsa-sha2-nistp521' | 'ssh-rsa';

/** Visão de credencial sem segredos — única forma que chega à interface. */
export interface CredentialSummary {
  id: string;
  name: string;
  kind: CredentialKind;
  createdAt: string;
  keyType: KeyType | null;
  publicKey: string | null;
  fingerprint: string | null;
  origin: 'imported' | 'generated' | null;
  usedByHostCount: number;
}

export interface KnownHostKey {
  endpoint: string;
  keyType: string;
  fingerprint: string;
  acceptedAt: string;
}

// --- Port forwarding --------------------------------------------------------

export interface ForwardRule {
  id: string;
  hostId: string;
  label: string | null;
  bindAddress: string;
  allowNonLoopback: boolean;
  bindPort: number;
  destHost: string;
  destPort: number;
}

export type ForwardRuleInput = Omit<ForwardRule, 'id'>;

export type ForwardStatusKind = 'inactive' | 'starting' | 'active' | 'error';

export interface ForwardRuleStatus {
  status: ForwardStatusKind;
  reason: ErrorCode | null;
}

export interface ActiveForward extends ForwardRuleStatus {
  ruleId: string;
  hostLabel: string;
  bindAddress: string;
  bindPort: number;
  destHost: string;
  destPort: number;
}

// --- Preferências (settings.json, sem segredos) ----------------------------

export type ThemePreference = 'system' | 'light' | 'dark';

/** Sistema em que o app roda (`runtime.Environment()` do Wails; specs/004). */
export type Platform = 'windows' | 'linux' | 'darwin';

export interface WindowBounds {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  maximized: boolean;
}

export interface Settings {
  theme: ThemePreference;
  terminalFontFamily: string;
  terminalFontSize: number;
  window: WindowBounds;
  /** Shell aberto pela nova aba (Ctrl+Shift+T). */
  defaultShell: LocalShell;
  /** Barra lateral em modo trilho. */
  sidebarCollapsed: boolean;
  /** Ids dos grupos recolhidos na árvore de hosts, lembrados entre reinícios. */
  collapsedGroups: string[];
  /** Vidro ligado pelo usuário (FR-162). */
  glassEnabled: boolean;
  /** `system` segue o Windows; os demais valores são ids da paleta da marca. */
  accent: string;
  /** Atalhos alterados pelo usuário: ação → combinação (`""` = desativado) (FR-173). */
  shortcuts?: Record<string, string>;
  /** Comportamento do terminal (FR-177). */
  copyOnSelect: boolean;
  rightClickPaste: boolean;
  bell: BellMode;
  boldBright: boolean;
  autoReconnect: boolean;
}

export type BellMode = 'off' | 'sound' | 'visual';

export interface Appearance {
  glass: boolean;
  highContrast: boolean;
  dark: boolean;
  /** Cor DWM convertida de ABGR para #rrggbb. */
  systemAccent: string | null;
}

// --- Perfis de terminal e esquemas de cores (US4, data-model) -------------------

export type CursorStyle = 'block' | 'bar' | 'underline';
export type SchemeOrigin = 'builtin' | 'imported' | 'custom';

export interface TerminalProfile {
  id: string;
  name: string;
  isGlobal: boolean;
  fontFamily: string;
  /** 8–32, padrão 14. */
  fontSize: number;
  /** 100–900. */
  fontWeight: number;
  fontWeightBold: number;
  /** 1.0–2.0, padrão 1.2. */
  lineHeight: number;
  /** -2–10 px. */
  letterSpacing: number;
  ligatures: boolean;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  /** `#rrggbb` ou null para usar a do esquema. */
  cursorColor: string | null;
  /** 100–100.000, padrão 10.000. */
  scrollback: number;
  /** 0.5–1.0, padrão 1.0. */
  backgroundOpacity: number;
  /** 0–40 px. */
  blur: number;
  /** 0–32 px, padrão 12. */
  padding: number;
  colorSchemeId: string;
}

export interface ColorScheme {
  id: string;
  name: string;
  origin: SchemeOrigin;
  foreground: string;
  background: string;
  cursor: string;
  /** `#rrggbb` ou `#rrggbbaa`. */
  selection: string;
  /** 16 cores ANSI: 0–7 normais, 8–15 brilhantes. */
  ansi: string[];
}

export interface FontInfo {
  family: string;
  source: 'system' | 'bundled';
  ligatures: boolean;
}

export interface SchemeImportResult {
  imported: ColorScheme[];
  /** Cores ausentes no arquivo, preenchidas com as do esquema padrão. */
  completed: string[];
}

/** O Go gravou um novo sistema detectado para o host (FR-178). */
export interface HostsChangedEvent {
  hostId: string;
  detectedOs: OsId | null;
}

export interface ProfilesChangedEvent {
  scope: 'global' | 'host';
  hostId?: string;
}

// --- Sessões (só em memória) ------------------------------------------------

export type SessionKind = 'ssh' | 'local' | 'sftp';
/**
 * Id estável de shell local: no Windows `powershell`, `pwsh`, `cmd`, `gitbash` ou `wsl:<distro>`;
 * no Linux e no macOS o nome do shell (`bash`, `zsh`, `fish`…).
 */
export type LocalShell = string;

export type LocalShellKind = 'powershell' | 'pwsh' | 'cmd' | 'gitbash' | 'wsl' | 'unix';

/** Shell detectado na máquina (o caminho do executável fica no Go). */
export interface LocalShellInfo {
  id: LocalShell;
  label: string;
  kind: LocalShellKind;
}
export type SendKeysCombo = 'ctrl+w' | 'ctrl+t' | 'ctrl+tab' | 'ctrl+k' | 'ctrl+b';

export type SessionState =
  | 'connecting'
  | 'awaitingHostKey'
  | 'authenticating'
  | 'awaitingPrompt'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'closed';

export interface TermSize {
  cols: number;
  rows: number;
}

export interface SessionStateEvent {
  sessionId: string;
  state: SessionState;
  /** Mensagem pt-BR para `disconnected`. */
  reason: string | null;
  /** Código de saída para `exited`. */
  exitCode: number | null;
  /** RTT do último keepalive SSH; null antes da primeira medição. */
  latencyMs: number | null;
}

export interface SessionDataEvent {
  sessionId: string;
  data: string;
}

export interface SessionClosedEvent {
  sessionId: string;
}

export interface HostKeyEvent {
  sessionId: string;
  kind: 'new' | 'changed';
  keyType: string;
  fingerprint: string;
  previousFingerprint: string | null;
}

export interface PromptEvent {
  sessionId: string;
  name: string;
  instructions: string;
  prompts: { text: string; echo: boolean }[];
}

export interface ActiveSummary {
  sessions: number;
  transfers: number;
  forwards: number;
}

// --- SFTP -------------------------------------------------------------------

export interface RemoteEntry {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  type: 'file' | 'dir' | 'link' | 'other';
}

export type TransferState = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed' | 'skipped';
export type ConflictChoice = 'replace' | 'skip' | 'cancelAll';

export interface Transfer {
  id: string;
  sessionId: string;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  bytesTotal: number;
  bytesDone: number;
  state: TransferState;
  reason: string | null;
}

export interface ConflictEvent {
  transferId: string;
  name: string;
  existingSize: number;
  existingModifiedAt: string;
}

// --- Importar e exportar (specs/003-host-import-export/data-model.md) --------

export type SourceKind =
  'openssh' | 'putty' | 'kitty' | 'kittyPortable' | 'csv' | 'mobaxterm' | 'securecrt' | 'openhost';

export interface ImportSource {
  kind: SourceKind;
  available: boolean;
  /** `~/.ssh/config` existe ou há sessões no registro. */
  defaultFound: boolean;
}

export type CsvField = 'nome' | 'endereco' | 'porta' | 'usuario' | 'grupo' | 'chave';
export type CsvMapping = Record<CsvField, number | null>;

export interface PreviewOptions {
  useDefault?: boolean;
  filePassword?: string;
  csvMapping?: CsvMapping;
}

export type ImportWarningCode =
  | 'INVALID_PORT'
  | 'MISSING_ADDRESS'
  | 'KEY_NOT_FOUND'
  | 'KEY_UNSUPPORTED'
  | 'OPTION_IGNORED'
  | 'LABEL_REPEATED'
  | 'TOKEN_UNSUPPORTED'
  | 'LINE_UNREADABLE';

export interface ImportWarning {
  code: ImportWarningCode;
  /** Opção ou token envolvido (ex.: `ProxyJump`). */
  name?: string;
  /** Linha no arquivo de origem. */
  line?: number;
}

export type RowState = 'ok' | 'invalid' | 'duplicate';
export type DuplicateAction = 'skip' | 'replace' | 'keepBoth';

export interface PreviewRow {
  rowId: string;
  label: string;
  address: string;
  port: number;
  username: string;
  groupPath: string[];
  keyRef: string | null;
  /** Arquivo:linha, nome da sessão ou linha do CSV. */
  origin: string;
  warnings: ImportWarning[];
  state: RowState;
  duplicateOf: { hostId?: string; rowId?: string } | null;
  selected: boolean;
  duplicateAction: DuplicateAction;
}

export type PreviewKeyStatus =
  'ready' | 'needsPassphrase' | 'skipped' | 'notFound' | 'unsupported' | 'existing';

/** Chave referenciada pela origem; o conteúdo fica só no Go. */
export interface PreviewKey {
  ref: string;
  name: string;
  path: string;
  status: PreviewKeyStatus;
  fingerprint: string | null;
  usedBy: number;
}

export interface PreviewView {
  id: string;
  kind: SourceKind;
  sourceLabel: string;
  rows: PreviewRow[];
  keys: PreviewKey[];
  ignored: { name: string; reason: string }[];
  fileWarnings: ImportWarning[];
  csv: { columns: string[]; mapping: CsvMapping; needsMapping: boolean } | null;
}

export interface RowPatch {
  label?: string;
  address?: string;
  port?: number;
  username?: string;
  selected?: boolean;
  duplicateAction?: DuplicateAction;
}

export interface ImportResult {
  batchId: string;
  created: number;
  replaced: number;
  skipped: number;
  ignored: number;
  keysStored: number;
  keysReused: number;
  /** Hosts sem chave que vão pedir a senha na primeira conexão. */
  askPassword: number;
}

export interface UndoResult {
  removed: number;
  restored: number;
  /** Hosts editados depois da importação, mantidos como estão. */
  keptEdited: number;
}

export type ExportFormat = 'openhost' | 'openssh' | 'csv';
export type ExportScope =
  { kind: 'all' } | { kind: 'group'; groupId: string } | { kind: 'hosts'; hostIds: string[] };

export interface ExportRequest {
  format: ExportFormat;
  scope: ExportScope;
  includeKeys: boolean;
  masterPassword?: string;
  filePassword?: string;
  sshConfigMode?: 'newFile' | 'append';
}

export interface ExportCount {
  hosts: number;
  groups: number;
  keys: number;
}

export interface ExportResult {
  path: string;
  hosts: number;
  keys: number;
}

// --- Atualização pelo app (specs/007, contracts/bridge-updater.md) -----------

export type UpdateInstall = 'nsis' | 'app' | 'appimage' | 'deb' | 'rpm' | 'manual' | 'dev';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'applying'
  | 'failed';

export type UpdateFailure =
  'network' | 'diskSpace' | 'signature' | 'checksum' | 'permission' | 'install';

export interface UpdateProgress {
  received: number;
  total: number;
}

export interface UpdateInfo {
  current: string;
  latest: string | null;
  prerelease: boolean;
  notes: string;
  install: UpdateInstall;
  oneClick: boolean;
  manualCommand: string | null;
  checkedAt: string;
  /** O aviso deve aparecer: há versão, não foi pulada e passou o "lembrar depois". */
  notify: boolean;
  state: UpdatePhase;
  progress: UpdateProgress | null;
  reason: UpdateFailure | null;
}

export interface UpdateStateEvent {
  state: UpdatePhase;
  version?: string;
  progress?: UpdateProgress;
  reason?: UpdateFailure;
}

export interface UpdatePrefs {
  auto: boolean;
  prerelease: boolean;
}

export interface UpdateResult {
  version: string;
  status: 'ok' | 'failed';
  reason?: UpdateFailure;
}

// Sincronização pelo Google Drive (specs/008, data-model.md).
export type SyncPhase =
  'off' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'needsPassword' | 'error' | 'locked';

export type SyncFailure = 'auth' | 'quota' | 'format' | 'removed' | 'corrupt';

export interface SyncInfo {
  state: SyncPhase;
  /** `false` em build sem cliente OAuth: a seção explica e não oferece conectar. */
  available: boolean;
  email: string | null;
  deviceName: string | null;
  lastSync: string | null;
  /** Mudanças locais ainda não enviadas. */
  pending: number;
  conflicts: number;
  reason: SyncFailure | null;
}

export interface SyncConnectResult {
  email: string;
  cloudHasVault: boolean;
}

export type SyncStartMode = 'upload' | 'replace' | 'merge';

export type SyncItemKind =
  | 'group'
  | 'host'
  | 'credential'
  | 'knownHost'
  | 'forward'
  | 'settings'
  | 'profile'
  | 'scheme'
  | 'prefs';

export interface ConflictSide {
  deleted: boolean;
  /** Campos legíveis; senhas, passphrases e chaves privadas chegam como "••••". */
  summary: { field: string; value: string }[];
}

export interface ConflictView {
  key: string;
  kind: SyncItemKind;
  label: string;
  local: ConflictSide;
  remote: ConflictSide;
}

export interface CloudVersion {
  name: string;
  createdAt: string;
  deviceName: string;
  items: number;
}

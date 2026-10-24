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
}

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
  createdAt: string;
  updatedAt: string;
}

export type HostInput = Omit<Host, 'id' | 'createdAt' | 'updatedAt'>;

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
  /** Shell aberto pelo Ctrl+T. */
  defaultShell: LocalShell;
  /** Barra lateral em modo trilho. */
  sidebarCollapsed: boolean;
  /** Vidro ligado pelo usuário (FR-162). */
  glassEnabled: boolean;
  /** `system` segue o Windows; os demais valores são ids da paleta da marca. */
  accent: string;
}

export interface Appearance {
  glass: boolean;
  highContrast: boolean;
  dark: boolean;
  /** Cor DWM convertida de ABGR para #rrggbb. */
  systemAccent: string | null;
}

// --- Sessões (só em memória) ------------------------------------------------

export type SessionKind = 'ssh' | 'local' | 'sftp';
export type LocalShell = 'powershell' | 'cmd';
export type SendKeysCombo = 'ctrl+w' | 'ctrl+t' | 'ctrl+tab' | 'ctrl+k';

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

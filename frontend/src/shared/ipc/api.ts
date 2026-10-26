// Contrato da ponte `window.shellvault` (contracts/ipc-bridge.md).
import type {
  ActiveForward,
  CsvMapping,
  DuplicateAction,
  ExportCount,
  ExportRequest,
  ExportResult,
  ExportScope,
  ImportResult,
  ImportSource,
  PreviewKey,
  PreviewOptions,
  PreviewView,
  RowPatch,
  SourceKind,
  UndoResult,
  ActiveSummary,
  Appearance,
  Platform,
  ColorScheme,
  ConflictChoice,
  ConflictEvent,
  CredentialSummary,
  ForwardRule,
  ForwardRuleInput,
  FontInfo,
  ForwardRuleStatus,
  Group,
  HostInput,
  HostKeyEvent,
  HostView,
  LocalShell,
  LocalShellInfo,
  SendKeysCombo,
  ProfilesChangedEvent,
  HostsChangedEvent,
  PromptEvent,
  RemoteEntry,
  SchemeImportResult,
  SessionDataEvent,
  SessionClosedEvent,
  SessionStateEvent,
  Settings,
  TerminalProfile,
  TermSize,
  Transfer,
  UpdateInfo,
  UpdatePrefs,
  UpdateResult,
  CloudVersion,
  ConflictView,
  SyncConnectResult,
  SyncInfo,
  SyncStartMode,
  UpdateStateEvent,
  VaultSettings,
  VaultStatus,
} from '../model/types';
import type { Result } from './result';

type R<T> = Promise<Result<T>>;
export type Unsubscribe = () => void;
type On<T> = (handler: (payload: T) => void) => Unsubscribe;

export type KeySource = { filePath: string } | { pem: string };
/** Atualização parcial; campos ausentes ficam como estão (formato de saída do zod `.partial()`). */
export type Patch<T> = { [P in keyof T]?: T[P] | undefined };

export interface ShellVaultApi {
  vault: {
    getStatus: () => R<VaultStatus>;
    create: (password: string, confirmation: string) => R<void>;
    unlock: (password: string) => R<void>;
    lock: () => R<void>;
    changePassword: (current: string, next: string, confirmation: string) => R<void>;
    erase: (confirmPhrase: string) => R<void>;
    getSettings: () => R<VaultSettings>;
    updateSettings: (patch: Patch<VaultSettings>) => R<VaultSettings>;
    reportActivity: () => R<void>;
    onStateChanged: On<VaultStatus>;
  };
  hosts: {
    list: () => R<HostView[]>;
    create: (input: HostInput) => R<HostView>;
    update: (id: string, input: HostInput) => R<HostView>;
    duplicate: (id: string) => R<HostView>;
    remove: (id: string) => R<void>;
    move: (id: string, groupId: string | null) => R<void>;
    onChanged: On<HostsChangedEvent>;
  };
  groups: {
    list: () => R<Group[]>;
    create: (name: string, parentId: string | null) => R<Group>;
    rename: (id: string, name: string) => R<Group>;
    move: (id: string, parentId: string | null) => R<void>;
    remove: (id: string) => R<void>;
  };
  credentials: {
    list: () => R<CredentialSummary[]>;
    createPassword: (name: string, password: string) => R<CredentialSummary>;
    pickKeyFile: () => R<{ filePath: string } | null>;
    importKey: (name: string, source: KeySource, passphrase: string | null) => R<CredentialSummary>;
    generateEd25519(name: string, passphrase: string | null): R<CredentialSummary>;
    copyPublicKey: (id: string) => R<void>;
    rename: (id: string, name: string) => R<CredentialSummary>;
    remove: (id: string) => R<void>;
  };
  sessions: {
    openSsh: (hostId: string) => R<{ sessionId: string }>;
    openLocal: (shell: LocalShell) => R<{ sessionId: string }>;
    write: (sessionId: string, data: string) => R<void>;
    resize: (sessionId: string, size: TermSize) => R<void>;
    reconnect: (sessionId: string) => R<void>;
    close: (sessionId: string) => R<void>;
    answerHostKey: (sessionId: string, accept: boolean) => R<void>;
    answerPrompt: (sessionId: string, answers: string[] | null) => R<void>;
    /** Combinação que o app captura como atalho, enviada ao shell (`ctrl+w`, `ctrl+t`, `ctrl+tab`, `ctrl+k`). */
    sendKeys: (sessionId: string, combo: SendKeysCombo) => R<void>;
    activeSummary: () => R<ActiveSummary>;
    onData: On<SessionDataEvent>;
    onState: On<SessionStateEvent>;
    onHostKey: On<HostKeyEvent>;
    onPrompt: On<PromptEvent>;
    onClosed: On<SessionClosedEvent>;
  };
  sftp: {
    open: (hostId: string) => R<{ sessionId: string; homePath: string }>;
    list: (sessionId: string, path: string) => R<RemoteEntry[]>;
    mkdir: (sessionId: string, path: string) => R<void>;
    rename: (sessionId: string, from: string, to: string) => R<void>;
    remove: (sessionId: string, path: string, recursive: boolean) => R<void>;
    upload: (sessionId: string, remoteDir: string) => R<{ transferIds: string[] }>;
    download: (sessionId: string, remotePaths: string[]) => R<{ transferIds: string[] }>;
    resolveConflict: (transferId: string, choice: ConflictChoice) => R<void>;
    cancel: (transferId: string) => R<void>;
    onTransfer: On<Transfer>;
    onConflict: On<ConflictEvent>;
  };
  forwards: {
    list: (hostId: string) => R<(ForwardRule & ForwardRuleStatus)[]>;
    listActive: () => R<ActiveForward[]>;
    create: (input: ForwardRuleInput) => R<ForwardRule>;
    update: (id: string, input: ForwardRuleInput) => R<ForwardRule>;
    remove: (id: string) => R<void>;
    activate: (id: string) => R<void>;
    deactivate: (id: string) => R<void>;
    onStatus: On<{ ruleId: string } & ForwardRuleStatus>;
  };
  /** Perfis de terminal e esquemas de cores (contracts/bridge.md, ProfileService). */
  profiles: {
    getGlobal: () => R<TerminalProfile>;
    updateGlobal: (patch: Partial<TerminalProfile>) => R<TerminalProfile>;
    getForHost: (hostId: string) => R<TerminalProfile | null>;
    setHostOverride: (hostId: string, profile: TerminalProfile | null) => R<TerminalProfile | null>;
    effective: (sessionId: string) => R<TerminalProfile>;
    listSchemes: () => R<ColorScheme[]>;
    saveScheme: (scheme: ColorScheme) => R<ColorScheme>;
    duplicateScheme: (id: string, name: string) => R<ColorScheme>;
    removeScheme: (id: string) => R<void>;
    /** Diálogo nativo; null quando cancelado. */
    importScheme: () => R<SchemeImportResult | null>;
    exportScheme: (id: string) => R<void>;
    listFonts: () => R<FontInfo[]>;
    onChanged: On<ProfilesChangedEvent>;
  };
  /** Importação com prévia (specs/003-host-import-export/contracts/bridge.md, ImportService). */
  imports: {
    sources: () => R<ImportSource[]>;
    /** Sem `useDefault`, abre o diálogo nativo; null quando cancelado. */
    preview: (kind: SourceKind, options: PreviewOptions) => R<PreviewView | null>;
    remapCsv: (previewId: string, mapping: CsvMapping) => R<PreviewView>;
    updateRow: (previewId: string, rowId: string, patch: RowPatch) => R<PreviewView>;
    selectAll: (previewId: string, selected: boolean, groupPath: string[] | null) => R<PreviewView>;
    setDuplicateAction: (previewId: string, action: DuplicateAction) => R<PreviewView>;
    unlockKey: (previewId: string, keyRef: string, passphrase: string) => R<PreviewKey>;
    skipKey: (previewId: string, keyRef: string) => R<PreviewKey>;
    commit: (previewId: string, targetGroupId: string | null) => R<ImportResult>;
    undo: (batchId: string) => R<UndoResult>;
    discard: (previewId: string) => R<void>;
    /** Diálogo de salvar; false quando cancelado. */
    saveCsvTemplate: () => R<boolean>;
  };
  exports: {
    count: (scope: ExportScope) => R<ExportCount>;
    /** Diálogo de salvar; null quando cancelado. */
    export: (request: ExportRequest) => R<ExportResult | null>;
  };
  app: {
    /** Sistema em que o app roda; lido uma vez no início (specs/004, contracts/platform.md). */
    getPlatform: () => R<Platform>;
    getAppearance: () => R<Appearance>;
    getUiSettings: () => R<Settings>;
    /** Shells instalados, em ordem estável (FR-176). */
    listLocalShells: () => R<LocalShellInfo[]>;
    updateUiSettings: (patch: Patch<Omit<Settings, 'window'>>) => R<Settings>;
    confirmClose: (confirmed: boolean) => R<void>;
    /** Botões da barra de título própria (FR-133); fechar passa pela confirmação de FR-028. */
    windowMinimise: () => R<void>;
    windowToggleMaximise: () => R<void>;
    windowClose: () => R<void>;
    windowIsMaximised: () => R<boolean>;
    /** Só `http`/`https`; abre no navegador padrão (FR-145). */
    openExternalUrl: (url: string) => R<void>;
    onAppearanceChanged: On<Appearance>;
    onCloseRequested: On<ActiveSummary>;
  };
  /** Atualização pelo próprio app (specs/007, contracts/bridge-updater.md). */
  updates: {
    info: () => R<UpdateInfo>;
    /** `manual`: sempre consulta e devolve o erro; automático respeita a preferência e cala. */
    check: (manual: boolean) => R<UpdateInfo>;
    download: () => R<void>;
    cancel: () => R<void>;
    remind: () => R<void>;
    skip: (version: string) => R<void>;
    prefs: () => R<UpdatePrefs>;
    setPrefs: (prefs: UpdatePrefs) => R<UpdatePrefs>;
    restartNow: () => R<void>;
    applyOnQuit: () => R<void>;
    lastResult: () => R<UpdateResult | null>;
    openDownloadFolder: () => R<void>;
    onState: On<UpdateStateEvent>;
  };
  /** Sincronização pelo Google Drive (specs/008, contracts/bridge-sync.md). */
  sync: {
    info: () => R<SyncInfo>;
    /** Abre o navegador e espera o login (até 5 min); cancelado ⇒ `SYNC_CANCELLED`. */
    connect: () => R<SyncConnectResult>;
    cancelConnect: () => R<void>;
    /** Depois de `connect` com cofre aberto; `replace`/`merge` pedem a senha da nuvem. */
    start: (mode: SyncStartMode, cloudPassword: string) => R<SyncInfo>;
    /** Primeira tela, sem cofre: cria o cofre local a partir da nuvem. */
    openFromCloud: (password: string) => R<void>;
    syncNow: () => R<SyncInfo>;
    conflicts: () => R<ConflictView[]>;
    resolve: (key: string, keep: 'local' | 'remote') => R<SyncInfo>;
    versions: () => R<CloudVersion[]>;
    restoreVersion: (name: string) => R<SyncInfo>;
    providePassword: (password: string) => R<SyncInfo>;
    setDeviceName: (name: string) => R<void>;
    disconnect: (deleteCloud: boolean) => R<void>;
    onState: On<SyncInfo>;
  };
}

export type ApiModule = keyof ShellVaultApi;

type EventKeys<M> = { [K in keyof M]: K extends `on${string}` ? K : never }[keyof M];
type InvokeKeys<M> = Exclude<keyof M, EventKeys<M>>;

/** Lista de funções e eventos por módulo; o preload gera a API a partir dela. */
export const API_SHAPE = {
  vault: {
    invoke: [
      'getStatus',
      'create',
      'unlock',
      'lock',
      'changePassword',
      'erase',
      'getSettings',
      'updateSettings',
      'reportActivity',
    ],
    events: ['onStateChanged'],
  },
  hosts: {
    invoke: ['list', 'create', 'update', 'duplicate', 'remove', 'move'],
    events: ['onChanged'],
  },
  groups: { invoke: ['list', 'create', 'rename', 'move', 'remove'], events: [] },
  credentials: {
    invoke: [
      'list',
      'createPassword',
      'pickKeyFile',
      'importKey',
      'generateEd25519',
      'copyPublicKey',
      'rename',
      'remove',
    ],
    events: [],
  },
  sessions: {
    invoke: [
      'openSsh',
      'openLocal',
      'write',
      'resize',
      'reconnect',
      'close',
      'answerHostKey',
      'answerPrompt',
      'sendKeys',
      'activeSummary',
    ],
    events: ['onData', 'onState', 'onHostKey', 'onPrompt', 'onClosed'],
  },
  sftp: {
    invoke: [
      'open',
      'list',
      'mkdir',
      'rename',
      'remove',
      'upload',
      'download',
      'resolveConflict',
      'cancel',
    ],
    events: ['onTransfer', 'onConflict'],
  },
  forwards: {
    invoke: ['list', 'listActive', 'create', 'update', 'remove', 'activate', 'deactivate'],
    events: ['onStatus'],
  },
  profiles: {
    invoke: [
      'getGlobal',
      'updateGlobal',
      'getForHost',
      'setHostOverride',
      'effective',
      'listSchemes',
      'saveScheme',
      'duplicateScheme',
      'removeScheme',
      'importScheme',
      'exportScheme',
      'listFonts',
    ],
    events: ['onChanged'],
  },
  imports: {
    invoke: [
      'sources',
      'preview',
      'remapCsv',
      'updateRow',
      'selectAll',
      'setDuplicateAction',
      'unlockKey',
      'skipKey',
      'commit',
      'undo',
      'discard',
      'saveCsvTemplate',
    ],
    events: [],
  },
  exports: { invoke: ['count', 'export'], events: [] },
  app: {
    invoke: [
      'getPlatform',
      'getAppearance',
      'getUiSettings',
      'listLocalShells',
      'updateUiSettings',
      'confirmClose',
      'windowMinimise',
      'windowToggleMaximise',
      'windowClose',
      'windowIsMaximised',
      'openExternalUrl',
    ],
    events: ['onAppearanceChanged', 'onCloseRequested'],
  },
  updates: {
    invoke: [
      'info',
      'check',
      'download',
      'cancel',
      'remind',
      'skip',
      'prefs',
      'setPrefs',
      'restartNow',
      'applyOnQuit',
      'lastResult',
      'openDownloadFolder',
    ],
    events: ['onState'],
  },
  sync: {
    invoke: [
      'info',
      'connect',
      'cancelConnect',
      'start',
      'openFromCloud',
      'syncNow',
      'conflicts',
      'resolve',
      'versions',
      'restoreVersion',
      'providePassword',
      'setDeviceName',
      'disconnect',
    ],
    events: ['onState'],
  },
} as const satisfies {
  [M in ApiModule]: {
    invoke: readonly InvokeKeys<ShellVaultApi[M]>[];
    events: readonly EventKeys<ShellVaultApi[M]>[];
  };
};

/** Nome do canal IPC: `"<módulo>:<função>"`. */
export function channelOf<M extends ApiModule>(module: M, name: keyof ShellVaultApi[M]): string {
  return `${module}:${String(name)}`;
}

/** Argumentos e retorno de uma função de invoke, para tipar os handlers do principal. */
export type InvokeArgs<
  M extends ApiModule,
  K extends keyof ShellVaultApi[M],
> = ShellVaultApi[M][K] extends (...args: infer A) => unknown ? A : never;

export type InvokeValue<
  M extends ApiModule,
  K extends keyof ShellVaultApi[M],
> = ShellVaultApi[M][K] extends (...args: never[]) => Promise<Result<infer T>> ? T : never;

export type EventPayload<M extends ApiModule, K extends keyof ShellVaultApi[M]> =
  ShellVaultApi[M][K] extends On<infer P> ? P : never;

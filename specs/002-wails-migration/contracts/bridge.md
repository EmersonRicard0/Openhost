# Contrato: ponte interface ↔ Go (Wails bindings + eventos)

**Feature**: `002-wails-migration` | Substitui `specs/001-mvp-ssh-client/contracts/ipc-bridge.md`

O contrato funcional é o da 001: mesmas operações, os mesmos `ErrorCode` e as mesmas regras de
segredo. Esta versão define como ele é exposto no Wails e lista o que é **novo** ou **alterado**.
Operações sem marcação mantêm assinatura e semântica da 001.

## Regras gerais

- Cada grupo de operações é uma struct Go ligada ao Wails (`Bind`): `VaultService`,
  `HostService` (hosts e grupos), `CredentialService`, `SessionService`, `SftpService`,
  `ForwardService`, `ProfileService` **novo**, `AppService`, e, desde a 003, `ImportService` e
  `ExportService`. Nenhuma outra struct é ligada no binário de release (os builds de teste
  ligam também `TestService` e `Smoke`, abaixo).
  Métodos exportados que não fazem parte deste contrato MUST NOT existir nessas structs (teste
  de reflexão compara a lista de métodos com este documento).
- A interface recebe sempre `Result<T>` =
  `{ ok: true, value: T } | { ok: false, error: { code: ErrorCode, message: string, op: string, detail: string } }`.
  Em Go, cada método devolve `(T, error)` (o gerador de bindings do Wails v2 não tipa
  genéricos) e todo erro passa por `apperr.Sanitize`: vira `*apperr.Error`, cujo texto é o JSON
  `{code, message, op, detail}`. `message` é fixa e curta em pt-BR; `op` identifica
  `Serviço.Método`; `detail` preserva o encadeamento técnico depois de remover senhas,
  passphrases, tokens e chaves privadas. Pânicos recuperados usam `INTERNAL` e colocam somente
  a mensagem sanitizada do pânico em `detail`, nunca a pilha. O adaptador
  `frontend/src/bridge` converte a promessa rejeitada em `{ ok: false, error }`; nenhuma
  exceção chega aos componentes.
- Toda entrada é validada no Go (tipos + regras do data-model); falha → `INVALID_INPUT`.
- Métodos 🔒 exigem cofre desbloqueado (`VAULT_LOCKED`).
- Segredos só trafegam interface → Go. Nenhum método devolve senha, passphrase ou chave privada.
- Caminhos locais só são escolhidos por diálogo nativo aberto pelo Go
  (`runtime.OpenFileDialog`/`OpenMultipleFilesDialog`/`OpenDirectoryDialog`); a interface
  nunca envia caminho local, exceto na importação de esquema de cores, que também usa diálogo.
- Eventos Go → interface: `runtime.EventsEmit(nome, payload)` com os nomes fixos abaixo; a
  interface registra **um** ouvinte por nome na inicialização (R10).

## ErrorCode

Os da 001 mais **novos**: `NO_COMMON_ALGORITHM` (FR-122), `AGENT_UNAVAILABLE` (FR-124),
`SCHEME_INVALID` (importação de esquema), `ALREADY_EXISTS` (nome já usado),
`IN_USE` (excluir esquema/perfil em uso),
`VAULT_MIGRATION_FAILED` (FR-102/103; o arquivo original permanece intacto).

Da 003 (importar e exportar): `IMPORT_TOO_LARGE`, `IMPORT_UNREADABLE`, `IMPORT_FORMAT_NEWER`,
`FILE_PASSWORD_REQUIRED`, `FILE_PASSWORD_WRONG`, `PREVIEW_EXPIRED`, `UNDO_UNAVAILABLE`.

Da 008 (sincronização): `SYNC_UNAVAILABLE`, `SYNC_CANCELLED`, `SYNC_AUTH`, `SYNC_QUOTA`,
`SYNC_FORMAT`, `CLOUD_EMPTY`, `CLOUD_CORRUPT`.

## VaultService

Como `vault.*` da 001, com:

| Método | Mudança |
|---|---|
| `GetStatus()` | **alterado**: `state` ganha `"migratable"` — existe `vault.svlt` da 001 e ainda não há `shellvault.db` |
| `Unlock(password)` | **alterado**: no estado `migratable`, desbloqueia e migra (R5); falha da migração → `VAULT_MIGRATION_FAILED` e estado volta a `migratable` |
| `GetSettings()` / `UpdateSettings(patch)` 🔒 | **alterado**: `VaultSettings` inclui `connectTimeoutSeconds` (5–120), `keepaliveSeconds`, `legacyDefault` e `term` (`xterm-256color` \| `xterm` \| `vt100` \| `linux`) |

Evento `vault:state`: `VaultStatus` a cada mudança de estado (equivale ao `onStateChanged` da 001).

## HostService 🔒

Como `hosts.*`/`groups.*` da 001. **Alterado**: `HostInput`/`HostView` ganham
`authMethod: "agent"`, `legacyAlgorithms: boolean`, `profileId: string | null`,
`detectedOs: OsId | null` e `osIcon: OsId | "auto"`. `detectedOs` é somente saída: valores
enviados em `Create`/`Update` são ignorados; `osIcon` é validado pela lista fechada do modelo.

Evento `hosts:changed`: `{ hostId: string, detectedOs: OsId | null }`, emitido quando a detecção
de sistema de uma conexão SSH altera o host persistido.

## CredentialService 🔒

Igual à 001 (`List`, `CreatePassword`, `ImportKey`, `PickKeyFile`, `GenerateEd25519`,
`CopyPublicKey`, `Rename`, `Remove`).

## SessionService

| Método | Entrada | Saída | Notas |
|---|---|---|---|
| `OpenSsh(hostId)` 🔒 | — | `{ sessionId }` | **alterado**: sem tamanho; a sessão espera o primeiro `Resize` válido para pedir o PTY remoto (FR-113) |
| `OpenLocal(shell)` | `"powershell" \| "cmd"` | `{ sessionId }` | **alterado**: idem |
| `Write(sessionId, data)` | string | `void` | |
| `Resize(sessionId, cols, rows)` | ints 1–1000 | `void` | ignorado se igual ao último enviado |
| `Reconnect(sessionId)` 🔒 | | `void` | |
| `Close(sessionId)` | | `void` | retorna após cancelar o contexto e encerrar as goroutines da sessão; emite `term:closed` |
| `AnswerHostKey` / `AnswerPrompt` / `ActiveSummary` | | | iguais à 001 |
| `SendKeys(sessionId, combo)` **novo** | `"ctrl+w" \| "ctrl+t" \| "ctrl+tab" \| "ctrl+k"` | `void` | envia ao servidor combinações reservadas pelo app (Assumptions) |

Eventos:

| Evento | Payload | Regra |
|---|---|---|
| `term:data` | `{ sessionId, data }` | lotes de até 8 ms ou 32 KiB; texto UTF-8 completo (R10) |
| `term:state` | `{ sessionId, state, reason?, latencyMs }` | `latencyMs` é o RTT inteiro do último keepalive, ou `null` antes da primeira medição |
| `term:hostkey` | como `onHostKey` da 001 | |
| `term:prompt` | como `onPrompt` da 001 | |
| `term:closed` | `{ sessionId }` | último evento da sessão; nada é emitido depois |

## SftpService

Igual a `sftp.*` da 001. Eventos `sftp:transfer` e `sftp:conflict`.

## ForwardService

Igual a `forwards.*` da 001 (`ListActive` e `Deactivate` sem 🔒). Evento `forwards:status`.

## ProfileService **novo**

| Método | Entrada | Saída | Notas |
|---|---|---|---|
| `GetGlobal()` | — | `TerminalProfile` | sem 🔒 (terminais locais funcionam com cofre bloqueado) |
| `UpdateGlobal(patch)` | `TerminalProfile` parcial | `TerminalProfile` | emite `profiles:changed` |
| `GetForHost(hostId)` 🔒 | | `TerminalProfile \| null` | |
| `SetHostOverride(hostId, profile \| null)` 🔒 | perfil completo ou null para remover | `TerminalProfile \| null` | |
| `Effective(sessionId)` | | `TerminalProfile` | global ⊕ override do host da sessão |
| `ListSchemes()` | — | `ColorScheme[]` | |
| `SaveScheme(scheme)` | `ColorScheme` sem `origin: builtin` | `ColorScheme` | |
| `DuplicateScheme(id, name)` | | `ColorScheme` | |
| `RemoveScheme(id)` | | `void` | `IN_USE` se referenciado |
| `ImportScheme()` | — (diálogo nativo `.json`/`.itermcolors`) | `{ imported: ColorScheme[], completed: string[] }` \| null | `completed` lista cores ausentes preenchidas; `SCHEME_INVALID` com motivo |
| `ExportScheme(id)` | — (diálogo de salvar) | `void` | formato do data-model |
| `ListFonts()` | — | `{ family, source: "system" \| "bundled", ligatures: boolean }[]` | só monoespaçadas |

Evento `profiles:changed`: `{ scope: "global" | "host", hostId? }`.

## AppService

Como `app.*` da 001, com:

| Método / evento | Mudança |
|---|---|
| `GetAppearance()` / `app:appearance` | igual |
| `GetPreferences()` / `UpdatePreferences(patch)` | **renomeado** de `getUiSettings`; inclui `glassEnabled`, `defaultShell`, `collapsedGroups` e `shortcuts: Record<string, string>`; no patch, `shortcuts` substitui o mapa inteiro (`""` desativa a ação) |
| `app:close-requested` / `ConfirmClose(bool)` | igual à 001 (FR-028) |
| `WindowMinimise()`, `WindowToggleMaximise()`, `WindowClose()` **novo** | botões da barra de título própria (FR-133); `WindowClose` passa pela confirmação de FR-028 |
| `OpenExternalUrl(url)` **novo** | abre no navegador padrão; só `http`/`https`; chamado apenas por Ctrl+clique (⌘-clique no macOS) (FR-145) |

**Plataformas (004).** A mesma ponte vale no Windows, no Linux e no macOS. A interface lê o
sistema pelo `Environment()` do runtime do Wails (não é método ligado). `WindowMinimise`,
`WindowToggleMaximise` e `WindowClose` só são chamados no Windows, onde a barra de título é
própria; no Linux e no macOS a moldura é nativa e o fechamento passa pelo mesmo `OnBeforeClose`.
`defaultShell` aceita os ids do Windows (`powershell`, `pwsh`, `cmd`, `gitbash`, `wsl:<distro>`) e,
no Unix, o nome do shell de `/etc/shells` (`bash`, `zsh`, `fish`…).

## ImportService e ExportService 🔒 (003)

Definidos em [`specs/003-host-import-export/contracts/bridge.md`](../../003-host-import-export/contracts/bridge.md).
Como os demais, escolhem arquivos só por diálogo nativo aberto pelo Go e nunca devolvem chave
privada, passphrase ou senha. A prévia e o último lote importado ficam só em memória e são
descartados quando o cofre bloqueia.

## UpdateService (007)

Definido em [`specs/007-in-app-update/contracts/bridge-updater.md`](../../007-in-app-update/contracts/bridge-updater.md).
Sem 🔒: funciona com o cofre bloqueado e não lê nada dele. `Info`, `Check(manual)`, `Download`,
`Cancel`, `Remind`, `Skip(version)`, `Prefs`/`SetPrefs`, `RestartNow`, `ApplyOnQuit`, `LastResult`,
`OpenDownloadFolder`. Evento `updates:state`: `{ state, version?, progress?: { received, total },
reason? }`. Nenhum argumento vira URL ou caminho: o Go só baixa os assets da release escolhida e
só grava e abre `updates/<versão>` na pasta de dados. A verificação automática roda depois de
`OnDomReady`, a cada 6 h, e nunca em build de desenvolvimento.

## SyncService (008)

Definido em [`specs/008-drive-sync/contracts/bridge-sync.md`](../../008-drive-sync/contracts/bridge-sync.md).
`Info`, `Connect`, `CancelConnect`, `Start(mode, cloudPassword)`, `OpenFromCloud(password)`,
`SyncNow`, `Conflicts`, `Resolve(key, keep)`, `Versions`, `RestoreVersion(name)`,
`ProvidePassword(password)`, `SetDeviceName(name)`, `Disconnect(deleteCloud)`. Evento
`sync:state` com `SyncInfo` (`state`, `available`, `email`, `deviceName`, `lastSync`, `pending`,
`conflicts`, `reason`) a cada mudança; quando `lastSync` muda, a interface relê o cofre, porque
mudanças de outro computador já foram aplicadas localmente. Senha mestra, DEK e refresh token
nunca cruzam a ponte; conflitos chegam com senha, passphrase e chave privada como `"••••"`.
`Resolve` e `RestoreVersion` só aceitam chaves e nomes da última listagem; nenhum argumento vira
URL ou caminho. Funciona só com o cofre aberto, exceto `Info`, `Connect`, `CancelConnect` e
`OpenFromCloud` (primeira tela, sem cofre). Sem client id no build, `Info` traz
`available: false` e `Connect` devolve `SYNC_UNAVAILABLE`. Em e2e, `SHELLVAULT_E2E_CLOUD_URL` aponta para o Drive falso.

## TestService (somente build com tag `e2e`)

Não existe no binário de release. `Maximise()`, `Restore()`, `SetSize(w, h)`, `Goroutines()`,
`SessionCount()`, `ServerSizeOf(sessionId)`, `SetUpdateSource(url, pubkeyB64)` e
`SetInstallKind(kind)` (007). A origem de releases e o formato de instalação também podem vir de
`SHELLVAULT_E2E_UPDATE_URL`, `SHELLVAULT_E2E_UPDATE_PUBKEY` e `SHELLVAULT_E2E_INSTALL_KIND`, lidos
ao iniciar. Usado pelos testes E2E (research R18).

## Smoke (somente build com tag `smoke`, 004)

Não existe no binário de release (`scripts/check-release.mjs` recusa `smokesvc`). Ligado em
`window.go.smokesvc.Smoke`.

| Método | Entrada | Saída | Efeito |
|---|---|---|---|
| `Ready()` | — | `void` | responde e encerra o processo com código 0 |

O frontend chama `Ready()` só quando `import.meta.env.VITE_SMOKE` está definido, depois de a tela
de criar o cofre aparecer e de criar cofre, host e chave pela ponte normal
(`frontend/src/app/smoke.ts`). Usado por `scripts/smoke.mjs` no CI dos três sistemas
(specs/004-linux-macos, R11).

# Tasks: Sincronização simples para o usuário final

**Input**: Design documents from `specs/013-sync-simples/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge.md,
contracts/folder-format.md, contracts/ui.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). `Remote`, `Folder`, detecção de pastas,
`Start("auto")` e chave órfã ganham testes antes do código; o e2e roda contra o app real.

**Divisão**: tarefas marcadas **(Codex)** vão num card da fila (`.agente-queue/`, worktree
`shellvault-codex`, branch `013-codex-backend`); o resto é do Claude. Commits sem `Co-Authored-By`.
Testes que abrem cofre usam sempre `SHELLVAULT_DATA_DIR` numa pasta temporária. Nenhum teste,
log ou mensagem usa credenciais OAuth reais.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário (US1–US6 da spec)

---

## Phase 1: Foundational — Go (Codex)

**Checkpoint**: `go test ./...` verde (excluindo `dist/`), sync da 008 inalterada com o Drive falso.

- [ ] T001 (Codex) `internal/cloudsync/remote.go`: `type Remote interface { List(ctx, class FileClass, pageSize int) ([]RemoteFile, error); Get(ctx, id string) ([]byte, error); Create(ctx, name string, data []byte) (RemoteFile, error); UpdateKeyring(ctx, id string, data []byte) error; Delete(ctx, id string) error }` e `RemoteFile{ID, Name, CreatedTime, Size}`; `Drive` passa a implementar (`DriveFile` → `RemoteFile`, `appProperties` interno ao `drive.go`). `Syncer`, `onboarding.go`, `password.go` e `retention.go` trocam `*Drive` por `Remote`; `DriveFactory` vira `RemoteFactory(ctx, persistentSyncState) Remote`. Todos os testes atuais de `cloudsync` e `bridge` seguem verdes sem mudar expectativa.
- [ ] T002 (Codex) Estado com lugar (R5) em `internal/cloudsync/syncer.go`: `persistentSyncState` ganha `Place` (`"drive" | "folder"`, "ausente ⇒ `drive`"), `FolderPath` ("só em `folder`; absoluto, existente, diretório") e `FolderKind` (`"googleDrive" | "oneDrive" | "dropbox" | "custom"`); validação exige e-mail/token só em `drive`. Teste: estado gravado pela 008 (sem `place`) carrega como `drive`.

---

## Phase 2: User Story 1 - Sincronizar pela pasta com um clique (Priority: P1) 🎯 MVP

**Goal**: ligar a sincronização pela pasta do Google Drive/OneDrive/Dropbox com um clique.

**Independent Test**: quickstart, cenários 1, 2, 4 e 5.

- [ ] T003 (Codex) [US1] Testes e depois `internal/cloudsync/folder.go`: `Folder` implementa `Remote` sobre `<pasta>/OpenHost` (contracts/folder-format.md): `ID = Name` validado pelos padrões `keyring.json`/`snap-*.ohs`; gravação em `.openhost-<16 hex>.tmp` + renomear; `List` ignora o que não casa com os padrões (cópias de conflito, temporários); `CreatedTime` = modificação; temporários próprios com mais de 1 h apagados; nada lido/gravado fora de `OpenHost/`; caminho recusado se sair da pasta por link simbólico.
- [ ] T004 (Codex) [US1] Arquivo chegando (R6): snapshot ou `keyring.json` de `Folder` que não abre é tratado como "ainda não chegou" (sem `CLOUD_CORRUPT`, tentado na próxima consulta) e só vira erro depois de 30 min sem mudar de tamanho; teste com metade de um `snap` copiada e depois completada.
- [ ] T005 [P] (Codex) [US1] Testes e depois detecção (R3): `internal/cloudsync/folders.go` (`FolderCandidate{Kind, Label, HasVault}`, ordem Google Drive > OneDrive > Dropbox, só pastas existentes e graváveis, `HasVault` = chave **e** snapshot) com `folders_windows.go` (unidades com `Meu Drive`/`My Drive`; `OneDriveConsumer`/`OneDriveCommercial`/`OneDrive`; `info.json` do Dropbox em `%APPDATA%` e `%LOCALAPPDATA%`), `folders_darwin.go` (`~/Library/CloudStorage/GoogleDrive-*/{Meu Drive,My Drive}`, `~/Library/CloudStorage/OneDrive-*`, `~/.dropbox/info.json`) e `folders_linux.go` (`~/.dropbox/info.json`); raízes injetáveis nos testes; build `e2e` devolve `SHELLVAULT_E2E_SYNC_FOLDER` como Google Drive.
- [ ] T006 (Codex) [US1] Ponte (contracts/bridge.md) em `internal/bridge/sync.go`: `FolderCandidates()`, `ConnectFolder(kind, path)` (`custom` exige caminho absoluto, existente, diretório e gravável ⇒ senão `INVALID_INPUT` com `field: "path"`), `Info()` com `place` e `folderLabel` (sem caminho); erro novo `SYNC_FOLDER_UNAVAILABLE` em `internal/apperr`; `Disconnect(deleteCloud)` na pasta apaga só os arquivos dos dois padrões e a subpasta vazia. Regerar `frontend/wailsjs` e atualizar `specs/002-wails-migration/contracts/bridge.md`.
- [ ] T007 [US1] Tipos e textos: `FolderCandidate`, `SyncInfo.place/folderLabel` em `frontend/src/shared/model/types.ts`, wrappers em `window.shellvault.sync`, chaves em `frontend/src/i18n/pt-BR.ts` ("Sincronizar pela pasta do <programa>", "Usar o cofre da pasta do <programa>", "Escolher uma pasta", "✓ Sincronizado pela pasta do <programa>").
- [ ] T008 [US1] Opção da pasta em `frontend/src/features/sync/SyncSettings.tsx` (desligada: primeiro candidato como principal, "Conectar Google Drive" como alternativa, "Escolher uma pasta" em "Mais opções" pelo seletor de pasta do sistema) e "Usar o cofre da pasta do <programa>" em `frontend/src/features/sync/OpenFromCloud.tsx`/`CreateVaultScreen.tsx` quando `hasVault`.
- [ ] T009 [US1] E2e `frontend/tests/e2e/sync-folder.spec.ts`: cenários 1, 2, 4 e 5 do quickstart com duas pastas de dados e uma pasta comum temporária; conferir que nenhum nome de arquivo contém rótulo, endereço ou nome do computador.

---

## Phase 3: User Story 2 - Ligar a sincronização sem procurar (Priority: P1)

**Goal**: convite depois de criar o cofre e ícone de nuvem na barra de status.

**Independent Test**: quickstart, cenário 7.

- [ ] T010 (Codex) [US2] `VaultSettings.SyncInvite` (`"pending" | "dismissed"`; "ausente = sem convite") em `internal/model/model.go`; gravado `"pending"` ao criar cofre novo em `internal/vault`; aceito por `VaultService.UpdateSettings`. Teste com cofre antigo (sem a chave).
- [ ] T011 [US2] `frontend/src/features/sync/SyncInvite.tsx` (contracts/ui.md): não modal, "Usar estes hosts em outros computadores?", botão principal pela ordem pasta → Google → escolher pasta, "Agora não" grava `dismissed`, some ao ligar; mostrado na área vazia de sessões quando `syncInvite === "pending"`.
- [ ] T012 [P] [US2] `frontend/src/features/sync/SyncStatusIcon.tsx` na barra de status: estado (desligada, sincronizado, pendente, erro), nome acessível "Sincronização: <estado>", dica com "pasta do <programa>" ou e-mail; desligada abre o convite (mesmo dispensado), ligada abre Configurações → Sincronização.
- [ ] T013 [US2] E2e em `sync-folder.spec.ts`: cenário 7 (dispensar, reiniciar, reabrir pelo ícone).

---

## Phase 4: User Story 3 - O app decide o óbvio ao conectar (Priority: P1)

**Goal**: uma senha, sem a pergunta "Juntar / Usar o do Drive".

**Independent Test**: quickstart, cenários 2 e 3.

- [ ] T014 (Codex) [US3] Testes e depois `Start("auto")` (R8) em `internal/cloudsync/onboarding.go` e `internal/bridge/sync.go`: nuvem vazia ⇒ `upload`; nuvem com cofre e cofre local "zero hosts, grupos, credenciais e encaminhamentos" ⇒ `replace`; senão ⇒ `merge`. `Connect()`/`ConnectFolder()` devolvem `willMerge`. Senha errada ⇒ `VAULT_BAD_PASSWORD` sem alterar nada local nem na nuvem.
- [ ] T015 [US3] `frontend/src/features/sync/CloudPasswordDialog.tsx` substitui `StartChoiceDialog.tsx`: um campo "Senha que você usa no outro computador"; com `willMerge`, a frase "Os hosts deste computador serão juntados aos do outro, e a senha daqui passa a ser a de lá."; "Mais opções" com "Usar só o cofre de lá (o deste computador vira cópia de segurança)" (`replace`); senha errada no próprio campo. Chama `Start("auto", senha)`.
- [ ] T016 [US3] E2e em `sync-folder.spec.ts`: cenário 3 (juntar sem perguntar, sem duplicar; "Mais opções" visível).

---

## Phase 5: User Story 4 - Envio interrompido se resolve sozinho (Priority: P1)

**Goal**: chave órfã não trava o Conectar.

**Independent Test**: quickstart, cenário 6.

- [ ] T017 (Codex) [US4] Testes e depois (R7): "nuvem com cofre" = `keyring.json` **e** ≥ 1 `snap-*.ohs`, em `Connect`, `ConnectFolder`, `FolderCandidates.HasVault` e `OpenFromCloud` (`CLOUD_EMPTY` para chave sozinha); `upload` com chave órfã a substitui por `UpdateKeyring`. Regressão nos dois lugares (Drive falso e `Folder`).
- [ ] T018 [US4] E2e: cenário 6 com o Drive falso e com a pasta (só `keyring.json`) ⇒ Conectar envia sem pedir senha, em `sync-folder.spec.ts` e `sync-devices.spec.ts`.

---

## Phase 6: User Story 5 - Tela e erros que não assustam (Priority: P2)

**Goal**: tela enxuta e erros em frases simples.

**Independent Test**: quickstart, cenário 8.

- [ ] T019 [P] [US5] Testes e depois `frontend/src/features/sync/syncErrors.ts`: frase + ação para `NETWORK`, `SYNC_AUTH`, `SYNC_QUOTA`, `SYNC_FORMAT`, `SYNC_FOLDER_UNAVAILABLE`, `CLOUD_CORRUPT`, `CLOUD_EMPTY`, `SYNC_CANCELLED` ("Conexão cancelada"), sem código técnico no texto; "Detalhes" só com código, operação e hora (sem `detail`, e-mail ou caminho); teste em `syncErrors.test.ts`.
- [ ] T020 [US5] `SyncSettings.tsx` ligada: "✓ Sincronizado pela pasta do <programa>" ou "✓ Sincronizado com <e-mail>", estado na mesma linha, "Desconectar", "Mais opções" fechado com nome do computador, versões anteriores, sincronizar agora e conflitos; erros pelo `syncErrors.ts` com "Detalhes" recolhido; rede/pasta indisponível sem aviso, só "Pendente".
- [ ] T021 [US5] E2e: cenário 8 (pasta removida ⇒ "Pendente" e frase, sem aviso repetido; "Detalhes" sem caminho nem e-mail).

---

## Phase 7: User Story 6 - Google sem aviso de app não verificado (Priority: P2)

**Goal**: cliente OAuth publicado, com página inicial e política de privacidade.

**Independent Test**: quickstart, cenário 9 (manual).

- [ ] T022 [P] [US6] `site/index.html` e `site/privacidade.html` estáticos, em português, preto piano com laranja do chevron: o que o app guarda e envia (cofre cifrado, só na pasta ou na área do app no Drive; e-mail só para mostrar a conta; nenhuma telemetria). Sem credenciais, ID do projeto no Google, e-mails pessoais nem dados de usuário.
- [ ] T023 [US6] `.github/workflows/pages.yml` publicando só `site/` no GitHub Pages; conferir que nada de `docs/` ou `specs/` é publicado.
- [ ] T024 [US6] No Console do Google (com confirmação do dono do projeto): Branding com nome, logotipo, página inicial e política; Público → "Publicar app". Registrar o resultado em `specs/013-sync-simples/validation.md`.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T025 Revisão de segurança (plano, Princípio II): validação de caminho em `ConnectFolder`, nada fora de `OpenHost/`, nomes de arquivo sem conteúdo, logs e "Detalhes" sem caminho/e-mail/token, `site/` limpo, `git log --all -S` pelos valores do cliente OAuth sem resultado, CI sem imprimir segredos.
- [ ] T026 Lint, typecheck, `npm test`, `go test ./...`, vets com `GOOS=linux`/`darwin`; e2e `sync-folder`, `sync`, `sync-devices`; `specs/013-sync-simples/validation.md` com cada cenário e SC; seção na nota da 0.7.0 (`docs/release-notes/0.7.0.md`) sobre a pasta sincronizada.

---

## Dependencies & Execution Order

- T001 → T002 → (T003, T004, T005, T010, T014, T017) → T006.
- Frontend de cada história depois do Go dela (bindings): US1 (T007–T009) depois de T003–T006; US2 (T011–T013) depois de T010; US3 (T015–T016) depois de T014; US4 (T018) depois de T017.
- T019 e US6 (T022–T024) não dependem do Go: começar por eles.
- T025–T026 no fim.

## Parallel Example

```text
Codex: T001 → T002 → T003 → T004 → T005 → T014 → T017 → T010 → T006
Claude: T019, T022, T023 → (Go pronto) T007–T009 → T011–T013 → T015–T016 → T018 → T020–T021 → T024–T026
```

## Implementation Strategy

MVP: US1 + US4 (pasta com um clique e sem chave órfã). Depois US3 e US2 (decisão automática e
convite), por fim US5 e US6. Cada história fecha com o cenário do quickstart verde antes da
próxima.

# Tasks: Sincronizar o cofre pelo Google Drive

**Input**: Design documents from `specs/008-drive-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge-sync.md,
contracts/cloud-format.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). Testes Go antes do código; e2e contra o app
real com o Drive falso e duas pastas de dados.

**Divisão**: **Go** = Codex (via `.agente-queue/`, sem git); demais = Claude. Commits sem
`Co-Authored-By`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 **Go** Adicionar `golang.org/x/oauth2` ao `go.mod` (justificado no plano) e criar `internal/cloudsync/config.go` com `ClientID`/`ClientSecret` vazios sobrescritos por `-ldflags -X` (release) ou, se vazios, lidos de `OPENHOST_GOOGLE_CLIENT_ID`/`OPENHOST_GOOGLE_CLIENT_SECRET` (build local, ver `docs/setup/google-drive.md`), `Available() bool`, e a base da API (`https://www.googleapis.com`) só alterável com tag `e2e`.
- [ ] T002 [P] **Go** `internal/apperr`: `SYNC_UNAVAILABLE`, `SYNC_CANCELLED`, `SYNC_AUTH`, `SYNC_QUOTA`, `SYNC_FORMAT`, `CLOUD_EMPTY`, `CLOUD_CORRUPT`; frontend: os mesmos em `frontend/src/shared/ipc/errors.ts` e causas em `frontend/src/i18n/errors.ts`.
- [X] T003 [P] Workflow `.github/workflows/release.yml`: passar `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (segredos) como `-ldflags "-X …/cloudsync.ClientID=… -X …/cloudsync.ClientSecret=…"` nos três builds; ausentes ⇒ build segue com sincronização indisponível e aviso `::warning::`.

---

## Phase 2: Foundational

**Checkpoint**: `go test ./internal/cloudsync/... ./internal/vault/...` verde e `GOOGLE_CLIENT_ID` vazio não quebra nada.

- [ ] T004 **Go** Migração 1→2 em `internal/vault/schema.go` (`sync_state`, R7) + teste com banco da versão 1; `Store.SyncState()/SetSyncState()` selando com AD `sync_state:1`; `Erase` apaga a linha.
- [ ] T005 **Go** `Store.OnChange(func())` disparado após `Mutate`/`MutateWithProfiles`/perfis/esquemas bem-sucedidos (não em falha nem no `Apply` vindo da nuvem); `Store.Rekey(password, newDEK)` recifra todas as linhas numa transação; testes.
- [ ] T006 [P] **Go** `internal/cloudsync/drivefake`: servidor `httptest` com list (q por nome, `orderBy=name desc`, `pageSize`), get `alt=media`, create multipart/resumable, update media, delete, token, revoke, falhas injetáveis (rede, 401, 403 `storageQuotaExceeded`) (R9).
- [ ] T007 **Go** `internal/cloudsync/drive.go` + teste contra o fake: `List`, `Get`, `Create`, `UpdateKeyring`, `Delete`, só `spaces=appDataFolder`; erros mapeados para `NETWORK`/`SYNC_AUTH`/`SYNC_QUOTA`.
- [ ] T008 **Go** `internal/cloudsync/format.go` + teste: keyring (`format`, `epoch`, `kdf`, `sealedKeys` com AD `keyring:<epoch>`) e snapshot (`"OHS1"`, cabeçalho, AD = cabeçalho, gzip, `contentHash`); recusa `format > 1` (`SYNC_FORMAT`), AD/hash errados (`CLOUD_CORRUPT`); teste SC-804: bytes do snapshot não contêm rótulo, endereço, usuário nem senha conhecidos.
- [ ] T009 **Go** `internal/cloudsync/items.go` + teste: `Content` + perfis + esquemas + prefs sincronizáveis (R8: `shortcuts`, `copyOnSelect`, `rightClickPaste`, `bell`, `boldBright`, `autoReconnect`) ↔ itens `kind:id` com hash estável; aplicar itens recebidos passa por `internal/validate`.
- [ ] T010 **Go** `internal/cloudsync/merge.go` + testes de tabela: dominância, concorrentes iguais, conflito, edição × exclusão, lápides (180 dias), dependências (grupo ausente, credencial ausente, regra órfã) (R4); propriedade: nenhuma versão perdida sem conflito.

---

## Phase 3: User Story 1 - Conectar e guardar no Drive (P1) 🎯 MVP

**Independent Test**: quickstart §2 cenários 1–3.

- [ ] T011 [US1] **Go** `internal/cloudsync/oauth.go` + teste: loopback `127.0.0.1:0`, PKCE S256, `state`, uma resposta só, prazo 5 min, cancelamento, e-mail do `id_token`, renovação, revogação; abrir navegador injetado (teste não abre).
- [ ] T012 [US1] **Go** `internal/cloudsync/syncer.go` + teste com fake: conectar com nuvem vazia (`upload`: chaveiro + 1º snapshot), agrupamento 3 s após `OnChange`, busca a cada 60 s e ao desbloquear, lamport, estados `syncing/synced/pending/error`, retentativa 5 s/15 s/60 s/5 min, parado com cofre bloqueado.
- [ ] T013 [US1] **Go** `internal/bridge/sync.go`: `SyncService` com `Info`, `Connect`, `CancelConnect`, `Start("upload","")`, `SyncNow`, `SetDeviceName` e evento `sync:state`; mapa no `internal/bridge/contract_test.go`; `TestService.SetCloudEndpoint(url)` só com tag `e2e`; testes.
- [X] T014 [P] [US1] Frontend: tipos `SyncInfo`, `ConflictView`, `CloudVersion` em `frontend/src/shared/model/types.ts`; `window.shellvault.sync` em `frontend/src/shared/ipc/api.ts` (+ `API_SHAPE`, `EVENT_NAMES`) e `frontend/src/bridge/index.ts`; store `frontend/src/stores/sync.ts` (+ teste) assinando `sync:state`.
- [X] T015 [US1] `frontend/src/features/sync/SyncSettings.tsx` em Configurações → Sincronização: indisponível (build sem client id), "Conectar Google Drive" (espera do navegador com cancelar), conta (e-mail), estado, última sincronização, "Sincronizar agora", nome do computador; i18n `t.sync` em `frontend/src/i18n/pt-BR.ts`.
- [X] T016 [US1] Indicador na barra de status (`frontend/src/app/StatusBar.tsx`): sincronizado/sincronizando/pendente/erro/conflito, com rótulo acessível, que abre a seção Sincronização (FR-819).
- [ ] T017 [US1] E2e `frontend/tests/e2e/sync.spec.ts`: cenários 1–3 do quickstart com o Drive falso.

---

## Phase 4: User Story 2 - Usar em outro computador (P1)

**Independent Test**: quickstart §2 cenários 4–5.

- [ ] T018 [US2] **Go** `internal/cloudsync/onboarding.go` + testes: `OpenFromCloud(password)` (senha errada ⇒ `VAULT_BAD_PASSWORD` sem gravar; sem nuvem ⇒ `CLOUD_EMPTY`), `Start("replace")` (backup `vault-backup-<data>.db`), `Start("merge")` (recifra com DEK da nuvem via `Rekey`, deduplicação por conteúdo-chave, R6); métodos no `SyncService`.
- [X] T019 [US2] Frontend: "Usar meu cofre do Google Drive" em `frontend/src/features/vault/CreateVaultScreen.tsx` (conectar → senha da nuvem → abre; `CLOUD_EMPTY` oferece criar cofre novo já ligado); `frontend/src/features/sync/StartChoiceDialog.tsx` ao conectar com cofre local e nuvem com cofre: "Juntar os dois", "Usar o do Drive (o local vira backup)", "Cancelar", com senha da nuvem.
- [ ] T020 [US2] E2e: cenários 4 e 5 com duas pastas de dados.

---

## Phase 5: User Story 3 - Dois computadores (P2)

**Independent Test**: quickstart §2 cenários 6–7.

- [ ] T021 [US3] **Go** Conflitos no `syncer` (guardados em `sync_state`, demais itens seguem), `Conflicts()` com segredos mascarados, `Resolve(key, keep)`; troca de senha com sync ligado gera época nova e regrava o chaveiro; outro computador vê `epoch` maior ⇒ `needsPassword` ⇒ `ProvidePassword` (adota DEK nova com `Rekey`); testes com dois syncers no mesmo fake.
- [X] T022 [US3] Frontend: `frontend/src/features/sync/ConflictDialog.tsx` (lista de conflitos, as duas versões lado a lado por campo, segredos mascarados, "Manter esta"; exclusão mostrada como "Excluído neste/no outro computador") e `NewPasswordDialog.tsx` para `needsPassword`; aviso não bloqueante quando surge conflito.
- [ ] T023 [US3] E2e: cenários 6 e 7.

---

## Phase 6: User Story 4 - Histórico e desconectar (P3)

- [ ] T024 [US4] **Go** `retention.go` (30 versões/30 dias) + `Versions()`, `RestoreVersion(name)` (nome da última listagem; vira snapshot novo), `Disconnect(deleteCloud)` (revoga, apaga `sync_state`, opcionalmente apaga a nuvem), detecção de nuvem removida (`error{removed}`) e de token revogado (`error{auth}`); testes.
- [X] T025 [US4] Frontend: `HistoryDialog.tsx` (data, computador, quantidade de itens, "Restaurar" com confirmação) e `DisconnectDialog.tsx` ("Manter cópia no Drive"/"Apagar do Drive"); estados de erro com "Conectar de novo".
- [ ] T026 [US4] E2e: cenários 8–10.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T027 Atualizar `specs/002-wails-migration/contracts/bridge.md` com o `SyncService` e o evento.
- [ ] T028 Revisão de segurança final (contrato §Segurança): `grep` de que token, senha e DEK não chegam ao frontend nem a logs; listener só em 127.0.0.1; nenhum argumento do frontend vira URL/caminho.
- [ ] T029 Rodar quickstart §1–§2 e registrar em `specs/008-drive-sync/validation.md`; §3 depende do cliente OAuth do dono do projeto.
- [ ] T030 CI verde nos três sistemas.

---

## Dependencies & Execution Order

- Setup (T001–T003) → Foundational (T004–T010) → US1 (T011–T017) → US2 (T018–T020) → US3 → US4 → Polish.
- Frontend T014–T016 pode começar com a ponte simulada enquanto o Codex faz T004–T013.
- T018 depende de T005 (`Rekey`) e T012; T021 depende de T010 e T012.

## Implementation Strategy

1. MVP: Foundational + US1 (backup no Drive) + US2 (outro computador).
2. US3 completa o uso diário em dois lugares; US4 dá recuperação e controle.

# Tasks: Atualização pelo próprio app, com aviso de versão nova

**Input**: Design documents from `specs/007-in-app-update/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge-updater.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). Testes Go antes do código; e2e contra o app
real com servidor de releases local.

**Divisão**: **Go** = Codex (via `.agente-queue/`, sem git); demais = Claude. Commits sem
`Co-Authored-By`.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 **Go** `scripts/sign-sums/main.go`: `-gen` grava `update-signing.key` (privada, base64, permissão 0600) e imprime a pública em base64; `-sign <SHA256SUMS.txt>` lê a privada de `UPDATE_SIGNING_KEY` (base64) e grava `SHA256SUMS.txt.sig` (base64 da assinatura Ed25519); teste com chave temporária (R2).
- [X] T002 [P] Workflow `.github/workflows/release.yml`: depois de gerar `SHA256SUMS.txt`, assinar com `go run ./scripts/sign-sums -sign` usando o segredo `UPDATE_SIGNING_KEY` e publicar `SHA256SUMS.txt.sig`; falhar se o segredo faltar em tags de versão.

---

## Phase 2: Foundational (pacote `internal/updater`)

**Checkpoint**: `go test ./internal/updater/...` verde no Windows e `GOOS=linux|darwin go vet`.

- [X] T003 **Go** `internal/updater/releases.go` + teste com `httptest`: `FetchReleases(ctx, cfg, etag)` (User-Agent, `If-None-Match`, 304, 403/429 → `RATE_LIMITED`), `Pick(releases, current, prerelease, install, goos, goarch) *Choice` (maior SemVer elegível; nunca igual/menor; exige pacote do formato; rascunhos fora) (R1, FR-702, FR-703).
- [X] T004 **Go** `internal/updater/verify.go` + teste: `Verify(sums, sig []byte, pub ed25519.PublicKey, name string, file io.Reader) error` com erros `signature`/`checksum`; `pubkey.go` com a chave do projeto (placeholder até T001 rodar no dono) (R2, FR-710).
- [X] T005 **Go** `internal/updater/install_{windows,darwin,linux}.go` + testes por tag: `DetectInstall() Install{Kind, Target, Writable, ManualCommand}` conforme a tabela de R3; `dev` para builds com tag `e2e` ou sem versão.
- [X] T006 **Go** `internal/updater/download.go` + teste: `.part`, `Range`, conferência de tamanho, progresso limitado a 250 ms, cancelamento apaga o parcial, espaço livre ×2, limpeza de versões antigas (R5).
- [X] T007 **Go** Preferências `updates` em `internal/appwin/preferences.go` (data-model `UpdatePrefs`, padrões `auto: true`, `prerelease: false`) com teste de validação e de leitura com cofre bloqueado (R6).

---

## Phase 3: User Story 1 - Saber que há versão nova (P1) 🎯 MVP

**Independent Test**: quickstart §2, cenários 1, 2 e 6.

- [X] T008 [US1] **Go** `internal/bridge/updates.go`: `UpdateService` com `Info`, `Check(manual)`, `Remind`, `Skip`, `Prefs`/`SetPrefs` e evento `updates:state`; verificação ao iniciar (depois da janela pronta) e a cada 6 h com `auto`; falha calada no automático (FR-701–FR-707); `TestService.SetUpdateSource` só com tag `e2e`; testes em `internal/bridge/updates_test.go`.
- [X] T009 [P] [US1] Frontend: tipos e `window.shellvault.updates` em `frontend/src/bridge/index.ts` e `frontend/src/shared/ipc/api.ts`; store `frontend/src/stores/updates.ts` (+ teste) assinando `updates:state`.
- [X] T010 [US1] `frontend/src/features/updates/UpdateToast.tsx`: aviso não bloqueante (sem roubar foco do terminal) com versão, selo "versão de teste", notas expansíveis (Markdown simples, sem HTML), "Atualizar", "Lembrar depois", "Pular esta versão"; i18n em `frontend/src/i18n/pt-BR.ts`; acessível (`role="status"`, foco só por Tab/atalho).
- [X] T011 [US1] Indicador na barra de status (`frontend/src/app/StatusBar.tsx`) enquanto há versão disponível/pronta, que reabre o aviso (FR-708).
- [X] T012 [US1] E2e `frontend/tests/e2e/update.spec.ts` com servidor de releases local: cenários 1, 2 e 6 do quickstart.

---

## Phase 4: User Story 2 - Atualizar com um clique (P1)

**Independent Test**: quickstart §2, cenários 3–5; §3 manual.

- [X] T013 [US2] **Go** `Download`, `Cancel`, verificação após o download (T004), estados `downloading/verifying/ready/failed` no `UpdateService`.
- [X] T014 [US2] **Go** Auxiliar `--apply-update` em `main.go` (antes do Wails) e `internal/updater/apply_{windows,darwin,linux}.go`: manifesto só em `updates/`, reverificação, espera do PID, NSIS `/S`, troca atômica do `.app` a partir do `.dmg`, troca do AppImage, `last-update.json`, reabrir; `RestartNow`, `ApplyOnQuit`, `LastResult` (R4, FR-711–FR-714). Testes da lógica de manifesto/troca com arquivos temporários.
- [X] T015 [US2] Frontend: progresso e cancelar no aviso; "Reiniciar para atualizar" com confirmação que conta sessões abertas (`useSessions`) e oferece "Reiniciar agora"/"Atualizar ao fechar"; mensagem de falha por motivo; aviso de sucesso/falha no início seguinte (`LastResult`).
- [X] T016 [US2] E2e: cenários 3, 4 e 5 (progresso até "pronto", assinatura inválida recusada, contagem de sessões na confirmação, sem reiniciar de fato).

---

## Phase 5: User Story 3 - Instalação manual (P2)

- [X] T017 [US3] Frontend: quando `oneClick` é falso, "Baixar pacote", "Abrir pasta" e o comando com botão de copiar (FR-715); **Go**: `OpenDownloadFolder` no serviço (abre só a pasta `updates/<versão>`).
- [X] T018 [US3] E2e: com `install = deb` simulado pelo `TestService`, o aviso mostra o comando e não oferece reiniciar.

---

## Phase 6: User Story 4 - Controlar as atualizações (P3)

- [X] T019 [US4] `frontend/src/features/updates/UpdateSettings.tsx` na página de Configurações: versão instalada, última verificação, "Procurar atualizações" (com "Você já está na versão mais recente"), "Verificar automaticamente", "Receber versões de teste" (FR-716).
- [X] T020 [US4] "Procurar atualizações" na paleta (`frontend/src/features/palette/CommandPalette.tsx`) (FR-717).
- [X] T021 [US4] E2e: cenário 7 e desligar o automático sem nenhuma requisição.

---

## Phase 7: Polish & Cross-Cutting

- [X] T022 Atualizar `specs/002-wails-migration/contracts/bridge.md` com o `UpdateService` e o evento.
- [X] T023 Revisão de segurança final (contrato §Segurança): conferir com `grep` que nenhum caminho/URL vem do frontend e que só o pacote verificado é executado.
- [X] T024 Rodar quickstart §1–§2 e registrar em `specs/007-in-app-update/validation.md`; §3 depende de duas rcs reais assinadas (pendência do dono do projeto: segredo `UPDATE_SIGNING_KEY`).
- [x] T025 CI verde nos três sistemas (PR #3, run 40548653412).

---

## Dependencies & Execution Order

- Setup (T001–T002) e Foundational (T003–T007) → US1 (T008–T012) → US2 (T013–T016) → US3 → US4 → Polish.
- Frontend T009–T011 pode começar com a ponte simulada enquanto o Codex faz T003–T008.
- T014 depende de T004 e T006.

## Implementation Strategy

1. MVP: Foundational + US1 (aviso) + US2 (1 clique) — o objetivo pedido.
2. US3 cobre Linux por pacote; US4 é controle.

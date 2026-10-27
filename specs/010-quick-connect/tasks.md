# Tasks: Tela inicial e conexão rápida

**Input**: Design documents from `specs/010-quick-connect/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge.md,
contracts/ui.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV).

**Divisão**: **(Codex)** num card da fila (73-010F, depois do 72); o resto é do Claude. Commits sem
`Co-Authored-By`. Cofre de teste sempre em `SHELLVAULT_DATA_DIR` temporário.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational — Go (Codex)

- [X] T001 (Codex) `SessionService.OpenQuick(target)` em `internal/bridge/sessions.go`: valida `address` (nome, IPv4 ou IPv6 sem colchetes), `port` "1–65535" e `username` "1–64 caracteres, sem espaço nem controle" com `internal/validate`; monta `sshx.Options` em memória com `Auth{Method: AuthAsk}`, agente SSH antes da senha quando houver, `LegacyAlgorithms = VaultSettings.LegacyDefault`, tempos e `$TERM` do cofre e `storeKnownHosts`; abre com `hostID = nil`; reconexão pede a senha de novo. Testes: alvo inválido por campo, nada gravado no cofre além da chave aceita, senha ausente de retornos, eventos e logs. Atualizar `specs/002-wails-migration/contracts/bridge.md`.
- [X] T002 (Codex) `favorite bool` em `model.Host`, `HostInput` (omitido no `Update` mantém), `HostView`, `Duplicate` e exportação/importação OpenHost v2. Testes.
- [X] T003 (Codex) `Recents []RecentEntry` em `internal/appwin/preferences.go` (fora de `SyncPreferences`); `AppService.RecordRecent(entry)` em `internal/bridge/app.go`: valida (`kind` `host` com UUID, ou `quick` com as regras do T001), remove a igual anterior (mesmo `hostId`, ou endereço normalizado + porta + usuário), põe no topo com `at` = agora (RFC 3339), corta em 20 e devolve a lista; `getUiSettings` devolve `recents`. Testes. Regerar `frontend/wailsjs`.

---

## Phase 2: Foundational — Frontend (Claude)

- [X] T004 [P] Testes e depois `frontend/src/features/home/quickTarget.ts` (`parseTarget`): válidos `host`, `user@host`, `host:2222`, `user@host:2222`, `10.0.0.1`, `user@10.0.0.1:22`, `2001:db8::1`, `[2001:db8::1]:2222`, `user@[2001:db8::1]`, `ssh user@host`, `ssh -p 2222 user@host`, `ssh -l user -p 2222 host`; inválidos `''`, `host:0`, `host:70000`, `us er@host`, `ssh -i chave host`, `user@`. Resultado `{address, port, username | null}` ou `{error}`.
- [X] T005 [P] Testes e depois `frontend/src/features/home/recents.ts` (`visibleRecents(recents, hosts)`): resolve `hostId`, descarta excluídos e favoritos, mantém a ordem, corta em 8.
- [X] T006 Tipos (`QuickTarget`, `RecentEntry`, `Host.favorite`, `Settings.recents`) em `frontend/src/shared/model/types.ts`; textos em `frontend/src/i18n/pt-BR.ts`; `Tab.quick` em `frontend/src/stores/sessions.ts`.

---

## Phase 3: User Story 1 - Conexão rápida (Priority: P1) 🎯 MVP

- [X] T007 [US1] `QuickConnectBar.tsx`: `combobox` "Conectar a um host", erro em `role="alert"`, Enter → `parseTarget`; host salvo igual (endereço normalizado, porta, usuário) → `connectHost`; sem usuário → diálogo "Usuário para <alvo>"; senão `connectQuick`.
- [X] T008 [US1] `connectQuick(target)` em `frontend/src/features/hosts/connect.ts` (`sessions.openQuick`, aba `user@host`, `quick` no `Tab`).
- [X] T009 [US1] "Salvar como host" no menu da aba (`TabBar.tsx`) para `tab.quick`, abrindo `HostForm` com endereço, porta e usuário preenchidos (sem senha).

## Phase 4: User Story 2 - Recentes e favoritos (Priority: P1)

- [X] T010 [US2] `HomeScreen.tsx` no lugar do bloco vazio de `Workspace.tsx`: barra, "Favoritos" (alfabético), "Recentes" (`visibleRecents`), botão de terminal local e dica quando vazio.
- [X] T011 [US2] `HostCard.tsx`: rótulo, `usuário@endereço[:porta]`, ícone, cor do ambiente (009), clique/Enter conecta, estrela "Favoritar"/"Desfavoritar".
- [X] T012 [US2] Registrar recente quando a sessão chega a `connected` (`recordRecent`, host ou quick), e "Favoritar"/"Desfavoritar" no menu do host em `HostList.tsx`.

## Phase 5: User Story 3 - Sugestões (Priority: P2)

- [X] T013 [US3] `listbox` "Hosts sugeridos" na barra com `filterHosts` (até 6), setas, Enter abre o sugerido, Esc fecha; trecho que bateu destacado.

## Phase 6: Polish

- [X] T014 Atalho `focusQuickConnect` (Ctrl+L / ⌘L) em `frontend/src/app/shortcuts.ts`, ativo só com a tela inicial.
- [X] T015 E2e `frontend/tests/e2e/home.spec.ts` com os cenários 1–5 do quickstart; incluir a conexão rápida no fluxo de `secrets-scan.spec.ts`.
- [X] T016 Revisão de segurança (plano): `OpenQuick`, `recordRecent`, ausência de senha em recentes, logs e eventos.
- [X] T017 Lint, typecheck, testes, `validation.md`.

## Dependencies & Execution Order

- T004–T006, T010, T011 (sem favoritar), T013 e T014 não dependem do Go.
- T007–T009 dependem de T001; T011 (estrela), T012 dependem de T002–T003.

## Implementation Strategy

MVP: US1 + US2. Frontend primeiro com o que não depende do Go; o resto entra quando o 73 chegar.

# Tasks: Digitar no grupo inteiro e biblioteca de comandos

**Input**: Design documents from `specs/012-broadcast-snippets/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge.md,
contracts/ui.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). Validação de snippet, migração 3, ida e
volta de sincronização e exportação, fila de escrita, destinos da transmissão e parser de campos
ganham testes antes do código; o e2e roda contra o app real.

**Divisão**: tarefas marcadas **(Codex)** vão num card da fila (`.agente-queue/`, worktree
`shellvault-codex`, branch `012-codex-backend` a partir de `012-broadcast-snippets`); o resto é do
Claude. Commits sem `Co-Authored-By`. Testes que abrem cofre usam sempre `SHELLVAULT_DATA_DIR`
numa pasta temporária.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário (US1–US6 da spec)

---

## Phase 1: Foundational — Go (Codex)

**Checkpoint**: `go test ./...` verde (excluindo `dist/`), `wails generate module` atualizado.

- [X] T001 (Codex) Testes e depois `model.Snippet{ID, Name, Text, Tags, Execute, CreatedAt, UpdatedAt}` e `Content.Snippets` em `internal/model/model.go`; validação em `internal/domain/snippets.go` (novo): nome "1–64 runas depois de `trim`; único sem diferenciar maiúsculas"; texto "1–4.000 runas; sem caracteres de controle além de `\n` (`\r\n` normalizado para `\n`); até 10 campos `{nome}` diferentes" com campo = `\{([A-Za-z0-9_-]{1,32})\}` e `{{`/`}}` literais (research R8); tags pelas regras de host (`domain.NormalizeHostMetadata`); "Até 500 por cofre". Erros `InvalidInput` com `field: "name" | "text" | "tags" | "snippets"`, sem o texto na mensagem. `Duplicate` gera "Nome (2)", "(3)"…; `Update` com chave ausente mantém o valor. Tabela de casos de campos em `internal/domain/testdata/snippet_fields.json`, que o frontend também usa (T012).
- [X] T002 (Codex) Migração 2 → 3 em `internal/vault/schema.go` (`SchemaVersion = 3`, `CREATE TABLE snippets (id TEXT PRIMARY KEY, sealed BLOB NOT NULL)`), CRUD selado em `internal/vault/rows.go`/`store.go` igual a hosts, inclusão em `ApplySynchronized` e na leitura de `Content`. Testes: cofre v2 migra sem perder hosts; v3 aberto por binário que só conhece v2 dá `errNewerSchema` sem alterar o arquivo.
- [X] T003 (Codex) `SnippetService` em `internal/bridge/snippets.go` (`List`, `Create`, `Update`, `Remove`, `Duplicate`, contrato em `contracts/bridge.md`), registro em `internal/bridge/services.go` e evento `snippets:changed` após mudança local ou sincronização aplicada. Teste em `internal/bridge` incluindo `VaultLocked` e `NotFound`.
- [X] T004 (Codex) Sincronização em `internal/cloudsync/items.go`: item `snippet:<id>` com validação do T001; `DecodeItems` passa a **ignorar e preservar** tipos desconhecidos (sem `rejected`), e `applyVersions` em `syncer.go` só acusa `CloudCorrupt` para item de tipo conhecido inválido (research R6). Testes: ida e volta de snippet, conflito por item, tipo `futuro:1` preservado no snapshot sem erro.
- [X] T005 (Codex) OpenHost v3: `exporter.Version = 3` em `internal/exporter/openhost.go` com `snippets: [{name, text, tags, execute}]`; `ExportRequest.includeSnippets` e `ExportCount.snippets` em `internal/bridge/export.go`; `internal/importer/openhost.go` lê v1–v3, prévia com `snippets: [{name, duplicateOf?}]` e decisão `skip | copy` como hosts; versão > 3 → aviso de versão mais nova. Testes de ida e volta, v1/v2 sem comandos e repetidos.
- [X] T006 (Codex) Atualizar `specs/002-wails-migration/contracts/bridge.md` com o `SnippetService` e os campos novos; regerar `frontend/wailsjs`; aceitar a ação `broadcast` na lista de atalhos válidos de `internal/appwin/preferences.go` (o frontend já tem o atalho Ctrl+Shift+G / Shift+Meta+G); tipos `Snippet`, `SnippetInput` em `frontend/src/shared/model/types.ts` e métodos em `frontend/src/shared/ipc/api.ts`.

---

## Phase 2: Foundational — frontend (Claude)

**Checkpoint**: `npm test` e typecheck verdes; digitação normal sem mudança de comportamento.

- [X] T007 Testes e depois `frontend/src/features/terminal/writer.ts`: `send(sessionId, data)` com uma fila por sessão (uma escrita por vez por sessão, o que chega durante a escrita vai junto na próxima, filas independentes entre sessões) e `drop(sessionId)` ao fechar; `TerminalView.tsx` passa a usar o módulo no lugar de `pending`/`writing` locais.
- [X] T008 [P] Chaves de texto da 012 em `frontend/src/i18n/pt-BR.ts` (textos de `contracts/ui.md`).

---

## Phase 3: User Story 1 - Digitar uma vez em todos os painéis (Priority: P1) 🎯 MVP

**Goal**: o que se digita no painel ativo vai aos painéis marcados do grupo.

**Independent Test**: quickstart cenário 1.

- [X] T009 [US1] Testes e depois `Group.broadcast?: { excluded: string[] }` em `frontend/src/stores/sessions.ts` com `setBroadcast(groupId, on)` e `setReceiving(groupId, sessionId, on)`; `join`, `splitOut`, `closeTab` e o desfazer de grupo tiram o membro que sai de `excluded`, e o modo some com o grupo (tabela de eventos de `data-model.md`). Teste em `sessions.test.ts`.
- [X] T010 [US1] `frontend/src/features/terminal/broadcast.ts` (+ teste): `targets(state, activeId)` = "membros do grupo − `a` − `excluded` − painéis não `connected`"; em `TerminalView.tsx`, o `onData` do painel focado com o grupo transmitindo chama `send` para ele e para cada destino.
- [X] T011 [US1] Botão "Digitar no grupo" (`aria-pressed`) e `data-broadcast` na aba do grupo em `TabBar.tsx`; ação `broadcast` em `frontend/src/app/shortcuts.ts` (Ctrl+Shift+G / Shift+Meta+G) e comando na paleta; faixas `data-broadcast="send|receive"` com `role="status"` ("Transmitindo para N painéis", "Recebendo do grupo", "Desconectado — não recebe") e checkbox "Receber do grupo" em `PaneHeader.tsx` + `terminal.module.css` na cor de destaque.

---

## Phase 4: User Story 2 - Avisos de produção e colagem (Priority: P1)

**Goal**: confirmar antes de transmitir para produção ou colar texto grande.

**Independent Test**: quickstart cenários 2 e 3.

- [X] T012 [US2] `frontend/src/features/terminal/BroadcastConfirm.tsx`: diálogo "Digitar em produção?" com os rótulos dos painéis cujo host tem `environmentId === 'prod'`, chamado por botão, atalho e paleta antes de `setBroadcast(…, true)`; faixa com " · Produção".
- [X] T013 [US2] Painel que passa a `prod` com o modo ligado entra em `excluded` e mostra toast "<rótulo> agora é Produção e saiu da transmissão" (observando o store `hosts` como o FR-906 da 009).
- [X] T014 [US2] Testes e depois `needsBroadcastConfirm(text)` em `frontend/src/features/terminal/paste.ts` ("2 linhas ou mais, ou com mais de 200 caracteres"); `pasteText` com o grupo transmitindo usa a regra e o diálogo de colagem existente mostra "Vai para N painéis"; cancelar não envia a ninguém; confirmar envia ao ativo e aos destinos por `send`.

---

## Phase 5: User Story 3 - Salvar comandos e mandar pela paleta (Priority: P1)

**Goal**: biblioteca no cofre e envio à sessão ativa.

**Independent Test**: quickstart cenário 4.

- [X] T015 [US3] Store `frontend/src/stores/snippets.ts`: `load()` por `SnippetService.List`, recarga no evento `snippets:changed`, limpar ao bloquear o cofre; CRUD chamando a ponte e mostrando erros por `field`.
- [X] T016 [US3] `frontend/src/features/snippets/SnippetsSettings.tsx`: seção "Comandos" em Configurações com lista, "Novo comando", "Duplicar", "Apagar" (confirmação) e formulário "Nome", "Comando" (área de texto), "Tags" (`TagInput` da 009) e "Executar ao enviar"; registro em `SettingsPage.tsx`.
- [X] T017 [US3] Testes e depois `snippetPayload(text, execute)` em `frontend/src/features/snippets/send.ts`: linhas unidas por `\r`, `\r` no fim só com `execute` (research R9); grupo "Comandos" na paleta (`frontend/src/features/palette/`) com busca por nome e texto sem maiúsculas nem acentos (normalização da 009), item desativado sem terminal com "Abra um terminal para enviar", envio por `send` e foco de volta ao terminal.

---

## Phase 6: User Story 4 - Campos a preencher (Priority: P2)

**Goal**: `{nome}` vira formulário antes de enviar.

**Independent Test**: quickstart cenário 5.

- [X] T018 [US4] Testes (usando `internal/domain/testdata/snippet_fields.json` do T001) e depois `frontend/src/features/snippets/fields.ts`: `parseFields(text)` (ordem da primeira ocorrência, repetido uma vez, `{{`/`}}` literais) e `fill(text, values)`.
- [X] T019 [US4] `frontend/src/features/snippets/FieldsDialog.tsx`: um campo por nome, Enter envia, recusa vazio ("Preencha o campo <nome>") e quebra de linha ("O campo <nome> não pode ter quebra de linha"), valor até 1.000 caracteres; últimos valores em memória no store `snippets` (`snippetId → campo → valor`), limpos ao bloquear.

---

## Phase 7: User Story 5 - Filtro por tag e envio ao grupo (Priority: P2)

**Goal**: comandos do fabricante primeiro e envio ao grupo inteiro.

**Independent Test**: quickstart cenário 6.

- [X] T020 [US5] Testes e depois `rankSnippets(snippets, hostTags, query)` em `frontend/src/features/snippets/rank.ts`: sem busca, tag em comum → sem tag → (outras só com busca); uso na paleta. Teste com 500 comandos dentro de 100 ms.
- [X] T021 [US5] Paleta num grupo: Enter = "Enviar ao painel", Shift+Enter = "Enviar ao grupo (N)" com rodapé visível; envio ao grupo passa pela confirmação de produção do T012 e mostra toast com os desconectados que não receberam.

---

## Phase 8: User Story 6 - Sincronizar e exportar (Priority: P3)

**Goal**: comandos na exportação/importação OpenHost; sincronização vem do Go.

**Independent Test**: quickstart cenário 7.

- [X] T022 [US6] Checkbox "Incluir comandos" (marcado) e contagem em `frontend/src/features/importexport/ExportDialog.tsx`; comandos repetidos na prévia de `ImportWizard.tsx`/`PreviewTable.tsx` com pular ou cópia; `stores/importExport.ts` passa `includeSnippets`.

---

## Phase 9: Polish & Cross-Cutting

- [X] T023 E2e `frontend/tests/e2e/broadcast-snippets.spec.ts` com os sete cenários do quickstart (produção contra o servidor SSH de teste); rodar também `split`, `sync`, `import-export`, `noc-ui` e `daily-use`.
- [X] T024 Revisão de segurança (plano, Princípio II): validação do `SnippetService` na ponte, texto de comando e valores de campo fora de logs, erros e disco; nenhum caminho de `send` para sessão fora do grupo, desmarcada ou de produção sem confirmação; leitor tolerante da nuvem não aceita item inválido de tipo conhecido.
- [X] T025 Lint, typecheck, `npm test`, `go test ./...`; `specs/012-broadcast-snippets/validation.md` com o resultado de cada cenário e SC (medir SC-1202 e SC-1205); nota de versão sobre o esquema 3 do cofre (versões antigas mostram o aviso de cofre mais novo).

---

## Dependencies & Execution Order

- Phase 1 (Codex) e Phase 2 (Claude) começam juntas.
- US1 (T009–T011) e US2 (T012–T014) dependem só do T007: começar por elas.
- US3–US6 (T015–T022) dependem do T003 e do T006 (bindings); T018 depende do arquivo de casos do T001; T022 depende do T005.
- T023–T025 no fim.

## Parallel Example

```text
Codex: T001 → T002 → T003 → T004 → T005 → T006
Claude: T007, T008 → T009–T011 → T012–T014 → (Go pronto) T015–T017 → T018–T019 → T020–T021 → T022 → T023–T025
```

## Implementation Strategy

MVP: US1 + US2 (transmissão segura, só frontend). Depois US3 (biblioteca), US4 e US5, e por fim
US6. Cada história fecha com o cenário do quickstart verde antes da próxima.

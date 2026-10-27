# Tasks: Ajustes de interface para o dia a dia em NOC

**Input**: Design documents from `specs/009-noc-ui-tweaks/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge.md,
contracts/ui.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). Validação no Go, padrões de ambiente,
exportação v2 e `extractPromptName` ganham testes antes do código; o e2e roda contra o app real.

**Divisão**: tarefas marcadas **(Codex)** vão num card da fila (`.agente-queue/`, worktree
`shellvault-codex`, branch `009-codex-backend`); o resto é do Claude. Commits sem `Co-Authored-By`.
Testes que abrem cofre usam sempre `SHELLVAULT_DATA_DIR` numa pasta temporária.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário (US1–US6 da spec)

---

## Phase 1: Foundational — Go (Codex)

**Checkpoint**: `go test ./...` verde (excluindo `dist/`), `wails generate module` atualizado.

- [X] T001 (Codex) Testes e depois os campos em `internal/model/model.go` e `internal/domain/hosts.go`: `Host`/`HostInput`/`HostView` com `environmentId *string`, `tags []string`, `notes string`. Regras (data-model.md): "0–20; cada uma 1–32 caracteres depois de `trim`, sem caracteres de controle; sem repetição comparando em minúsculas; ordem do usuário preservada"; nota "0–2.000 caracteres (contados em runas); quebras de linha permitidas". Erro `InvalidInput` com `field: "tags"` ou `"notes"`, sem o conteúdo da nota na mensagem. No `Update`, chave ausente mantém o valor (mesmo padrão de `legacySpecified`/`osIconSpecified`); `Duplicate` copia os três; `HostView` devolve `tags: []` e `notes: ""`, nunca `null`.
- [X] T002 (Codex) `model.Environment{ID, Name, Color}` e `VaultSettings.Environments` em `internal/model/model.go`; padrões quando `nil` em `DefaultVaultSettings` e na leitura do cofre (`internal/vault`): `prod`/Produção/`red`, `staging`/Homologação/`amber`, `lab`/Laboratório/`green`, `customer`/Cliente/`slate`; `[]` é mantido vazio. Validação: nome "1–24 caracteres depois de `trim`; único sem diferenciar maiúsculas", cor em `red, orange, amber, green, teal, blue, slate, pink`, no máximo 12. Testes com cofre antigo (sem a chave), `nil` e `[]`.
- [X] T003 (Codex) `VaultService.UpdateSettings` em `internal/bridge/vault.go` aceita `environments` (lista inteira; `id: ""` → gerado com `domain.NewID`); `InvalidInput` com `field: "environments"`. Teste em `internal/bridge`.
- [X] T004 (Codex) Preferências `HostDensity` (`comfortable` padrão | `compact`) e `PromptTitle` (padrão `true`) em `internal/appwin/preferences.go`, setters em `internal/bridge/app.go` (`setUiSetting`, outros valores → `InvalidInput`); `SyncPreferences.PromptTitle` em `internal/cloudsync/items.go` (ida e volta em `SyncPreferencesFrom`/`ApplySyncPreferences`). Testes.
- [X] T005 (Codex) Exportação OpenHost v2: `exporter.Version = 2` em `internal/exporter/openhost.go`, host com `tags`, `notes`, `environment: {name, color} | null`; `internal/importer/openhost.go` lê v1 (campos vazios) e v2, associa o ambiente pelo nome sem diferenciar maiúsculas ou cria no fim da lista (com 12, host sem ambiente e aviso na prévia). Testes de ida e volta e de v1.
- [X] T006 (Codex) Teste de ida e volta da sincronização com host com tags/nota/ambiente e lista de ambientes em `internal/cloudsync` (merge preserva os campos). Atualizar `specs/002-wails-migration/contracts/bridge.md` com os campos novos. Regerar `frontend/wailsjs`.

---

## Phase 2: Foundational — Frontend (Claude)

- [X] T007 Tipos em `frontend/src/shared/model/types.ts` (`Host.environmentId/tags/notes`, `Environment`, `EnvironmentColor`, `VaultSettings.environments`, `Settings.hostDensity/promptTitle`) e chaves de texto em `frontend/src/i18n/pt-BR.ts`.
- [X] T008 [P] `frontend/src/theme/environments.ts`: valor de cada id de cor por tema (escuro, claro, alto contraste) e teste em `environments.test.ts` conferindo contraste ≥ 3:1 com o fundo da barra de abas de cada tema.

---

## Phase 3: User Story 1 - Cor do ambiente (Priority: P1) 🎯 MVP

**Goal**: host com ambiente mostra a cor na aba e na borda do terminal.

**Independent Test**: quickstart, cenário 1.

- [ ] T009 [US1] Seletor "Ambiente" (`combobox`, "Nenhum" + lista) em `frontend/src/features/hosts/HostForm.tsx`.
- [ ] T010 [US1] `TabBar.tsx`: `data-environment`, barra de 3 px no topo, nome acessível com `, ambiente <nome>` e dica; `environmentId` sem ambiente correspondente → sem cor.
- [ ] T011 [US1] `TerminalView.tsx`, `PaneHeader.tsx` e `terminal.module.css`: borda interna de 2 px sempre reservada (transparente sem ambiente), `data-environment` no contêiner; anel de foco do painel por fora da borda; nome do ambiente no cabeçalho do painel.
- [ ] T012 [US1] Cor ligada ao host pelo store `hosts`, para que trocar o ambiente atualize as sessões abertas sem reconectar (FR-906).
- [ ] T013 [US1] `frontend/src/features/settings/EnvironmentsEditor.tsx` em Configurações → Aparência: renomear, trocar cor (8 opções), adicionar, remover (máx. 12), salvando por `vault.updateSettings({environments})`.

---

## Phase 4: User Story 2 - Configurações como aba (Priority: P1)

**Goal**: Configurações viram uma aba própria; nenhuma outra fica marcada.

**Independent Test**: quickstart, cenário 2.

- [X] T014 [US2] Testes e depois `settingsOpen`/`settingsActive` em `frontend/src/stores/workspace.ts`: abrir (ativa a existente), ativar sessão, fechar (volta ao id ativo anterior ou à tela vazia), sem persistir.
- [X] T015 [US2] `TabBar.tsx`: item "Configurações" com ícone e botão "Fechar Configurações", fora do arrastar e dos grupos; com ele ativo nenhuma sessão tem `aria-selected="true"`.
- [X] T016 [US2] `Workspace.tsx`: com `settingsActive`, terminais ocultos mas montados e `SettingsPage` no lugar; atalhos de terminal em `frontend/src/features/terminal/commands.ts` não agem; Ctrl+W e Esc fecham as Configurações; botão, atalho e paleta passam a abrir a aba.

---

## Phase 5: User Story 3 - Lista de hosts mais legível (Priority: P2)

**Goal**: seleção laranja e densidade compacta.

**Independent Test**: quickstart, cenário 3.

- [X] T017 [P] [US3] Barra vertical na cor de destaque no item selecionado (`data-selected`) em `frontend/src/features/sidebar/sidebar.module.css` e `frontend/src/features/hosts/HostList.tsx`.
- [ ] T018 [US3] Densidade (`data-density`): item compacto de 28 px com ícone menor, rótulo e endereço na mesma linha e reticências; rádio "Densidade da lista" em Configurações → Aparência gravando `hostDensity`.

---

## Phase 6: User Story 4 - Tags e notas (Priority: P2)

**Goal**: tags e nota no editor, na lista e na busca.

**Independent Test**: quickstart, cenário 4.

- [ ] T019 [US4] `frontend/src/features/hosts/TagInput.tsx` (Enter ou vírgula adiciona, Backspace no campo vazio remove a última, "Remover tag <nome>", recusa repetida, > 32 caracteres e a 21ª com mensagem) e área "Notas" com contador `n/2000` em `HostForm.tsx`; erros do Go por `field`.
- [ ] T020 [US4] Tags no item da lista (`<span data-tag>`; no compacto, as que couberem e `+N`) em `HostList.tsx`.
- [X] T021 [US4] Busca da lista por rótulo, endereço, tags e nota sem diferenciar maiúsculas nem acentos (normalização NFD), com teste em `frontend/src/stores/hosts.test.ts` (ou no módulo de filtro existente) e 500 hosts.

---

## Phase 7: User Story 5 - Nome da aba pelo prompt (Priority: P3)

**Goal**: aba com o nome do equipamento lido do prompt.

**Independent Test**: quickstart, cenário 5.

- [X] T022 [P] [US5] Testes e depois `frontend/src/features/terminal/promptTitle.ts` (`extractPromptName`): `<BNG.PINDORETAMA>`, `[~BNG.PINDORETAMA]`, `[*OLT-01]`, `[OLT-01]`, `R1#`, `R1>`, `R1(config-if)#`, `user@srv:~$`, `root@srv:/etc#`, `[admin@MikroTik] >`; recusar linhas de saída comuns, controle e > 64 caracteres.
- [X] T023 [US5] `Tab.promptTitle` e `manualTitle` em `frontend/src/stores/sessions.ts` (renomear à mão grava `manualTitle`), título exibido manual > prompt > rótulo, com teste em `sessions.test.ts`.
- [ ] T024 [US5] `TerminalView.tsx`: ler a linha do cursor após escrita, no máximo 1×/s, só com o cursor no fim da linha, só em sessões SSH; dica da aba com `rótulo — usuário@endereço:porta`; checkbox "Nome da aba pelo prompt" em `TerminalSettings.tsx`.

---

## Phase 8: User Story 6 - Campo de porta simples (Priority: P3)

**Goal**: porta sem − e +.

**Independent Test**: quickstart, cenário 6.

- [X] T025 [P] [US6] `steppers={false}` em `frontend/src/ui/NumberField.tsx` (setas do teclado mantidas) e seleção do valor ao focar; uso no campo de porta de `HostForm.tsx`.

---

## Phase 9: Polish & Cross-Cutting

- [ ] T026 E2e `frontend/tests/e2e/noc-ui.spec.ts` com os seis cenários do quickstart (o de prompt contra o servidor SSH de teste com `PS1='<BNG.PINDORETAMA>'`); rodar também `settings`, `sync`, `update` e `split` para garantir que a região "Configurações" segue funcionando.
- [ ] T027 Revisão de segurança (plano, Princípio II): validação dos campos novos na ponte, nota fora de logs e mensagens de erro, nada novo saindo sem a sincronização.
- [ ] T028 Lint, typecheck, `npm test`, `go test ./...`; `specs/009-noc-ui-tweaks/validation.md` com o resultado de cada cenário e SC; nota de versão sobre versões antigas editando host (spec, edge cases).

---

## Dependencies & Execution Order

- Phase 1 (Codex) e Phase 2 (Claude) começam juntas.
- US2 (T014–T016), US3 seleção (T017), US5 (T022–T024) e US6 (T025) não dependem do Go: começar por elas.
- US1 (T009–T013), US3 densidade (T018) e US4 (T019–T021) dependem de T001–T004 e T006 (bindings).
- T026–T028 no fim.

## Parallel Example

```text
Codex: T001 → T002 → T003 → T004 → T005 → T006
Claude: T007, T008 → T014–T016 → T017 → T022–T025 → (Go pronto) T009–T013, T018–T021 → T026–T028
```

## Implementation Strategy

MVP: US1 + US2 (as duas P1). Depois US3 e US4, e por fim US5 e US6. Cada história fecha com o
cenário do quickstart verde antes da próxima.

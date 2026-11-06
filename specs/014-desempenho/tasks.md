# Tasks: Menos memória e terminal mais leve

**Input**: Design documents from `specs/014-desempenho/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge.md, quickstart.md

**Tests**: TDD (Princípio IV) — testes antes do código em cada história; o teste de memória é a
regressão do vazamento.

**Donos**: `[Codex]` = Go, pela fila `.agente-queue` (worktree `shellvault-codex`, branch
`014-codex-backend`); `[Claude]` = frontend e e2e, neste worktree.

## Phase 1: Setup

- [X] T001 [Claude] Transformar o protótipo `frontend/tests/e2e/zz-mem-baseline.spec.ts` em `frontend/tests/e2e/memory.spec.ts` (sem metas ainda): mede árvore de processos por `--type` (formato invariante), heap JS com `HeapProfiler.collectGarbage`, grava `test-results/memory.md`; apagar o protótipo
- [ ] T002 [Claude] Rodar T001 três vezes e registrar a variação entre execuções em `specs/014-desempenho/baseline.md` (margem de ruído das metas)

## Phase 2: Foundational

- [X] T003 [Codex] Teste em `internal/session/pause_test.go`: `Pause` para a leitura da saída, `Resume` volta, pausa "expira sozinha em 30 s", `Close` libera o leitor mesmo pausado, idempotência e sessão inexistente retorna `nil` (contracts/bridge.md)
- [X] T004 [Codex] Implementar `paused`/`pausedAt` e o gate no leitor em `internal/session/manager.go` (entrada do usuário continua indo; data-model.md "Fluxo da sessão")
- [X] T005 [Codex] `SessionService.Pause/Resume(sessionId)` em `internal/bridge/` com validação do formato de id; `wails generate module`
- [ ] T006 [Claude] `sessions.pause/resume` em `frontend/src/shared/ipc/api.ts` e `frontend/src/bridge/index.ts` (+ mock dos testes, se houver)

**Checkpoint**: ponte com pause/resume pronta.

## Phase 3: User Story 1 — App leve em repouso (P1) 🎯 MVP

**Goal**: ≤ 300 MB com cofre aberto e sem abas (SC-1401).
**Independent Test**: cenário "cofre aberto, sem abas" do `memory.spec.ts`.

- [X] T007 [P] [US1] [Codex] Teste em `internal/vault/` que, após `Create`/`Unlock`/`ChangePassword`, chama o gancho de devolução de memória (função injetável) uma vez, fora do lock
- [X] T008 [US1] [Codex] Chamar `debug.FreeOSMemory()` em goroutine após cada derivação Argon2id em `internal/vault/` (abrir, criar, trocar senha, abrir cofre da nuvem em `internal/cloudsync` se derivar) — parâmetros do Argon2 inalterados
- [X] T009 [P] [US1] [Codex] `debug.SetMemoryLimit(256 << 20)` na inicialização em `main.go` (limite suave), com comentário citando research R1
- [ ] T010 [US1] [Claude] Meta SC-1401 em `frontend/tests/e2e/memory.spec.ts`: total do app ≤ 300 MB 10 s após abrir o cofre; e 5 bloqueios/desbloqueios não somam > 20 MB

## Phase 4: User Story 2 — Fechar abas devolve a memória (P1)

**Goal**: +30 MB no máximo após abrir e fechar 20 terminais (SC-1403).
**Independent Test**: cenário de ciclos do `memory.spec.ts`.

- [X] T011 [P] [US2] [Claude] Vitest em `frontend/src/features/terminal/dataBus.test.ts`: backlog só de sessões abertas, "teto 1 MiB" por sessão descartando os lotes mais antigos, sessão fechada descarta e ignora novos lotes
- [X] T012 [US2] [Claude] Implementar T011 em `frontend/src/features/terminal/dataBus.ts` (`push` no lugar de `[...lista, dado]`)
- [X] T013 [P] [US2] [Claude] Vitest em `frontend/src/features/terminal/webglPool.test.ts`: no máximo visíveis + 1 recém-escondido com WebGL; liberar chama `loseContext` antes de `dispose`; fechar a aba libera
- [X] T014 [US2] [Claude] `frontend/src/features/terminal/webglPool.ts` e uso em `TerminalView.tsx` (efeito de visibilidade e desmontagem) — research R2 (a) e (b)
- [ ] T015 [US2] [Claude] Dois heap snapshots (antes de abrir / depois de fechar 20) via CDP; corrigir cada retenção achada (registro de terminais, sonda de teste, `watchPrompt`, store de sessões, busca) e anotar em `specs/014-desempenho/research.md` R3
- [ ] T016 [US2] [Claude] Metas SC-1403 em `memory.spec.ts`: +30 MB após fechar 20 em 30 s; 3 ciclos não somam > 15 MB

## Phase 5: User Story 3 — Cada aba custa menos (P2)

**Goal**: ≤ 15 MB por aba ociosa (SC-1402), troca < 100 ms.
**Independent Test**: cenário "20 terminais" ÷ 20 do `memory.spec.ts` + `performance.spec.ts`.

- [X] T017 [US3] [Claude] `SearchAddon` carregado na primeira busca da aba em `TerminalView.tsx` / `terminalRegistry.ts` / `SearchBar.tsx` (R5)
- [X] T018 [US3] [Claude] Medir renderer DOM puro vs WebGL com pool (R2 c) em 20 abas e troca de aba; registrar em `research.md` e adotar o vencedor como padrão (WebGL vira opção em Configurações se o DOM vencer)
- [X] T019 [US3] [Claude] Meta SC-1402 em `memory.spec.ts` (≤ 15 MB/aba) e rodar `performance.spec.ts` (SC-1405)

## Phase 6: User Story 4 — Saída intensa sem engordar (P2)

**Goal**: heap estável com saída contínua (SC-1404); eco ≤ 50 ms p95.
**Independent Test**: 5 min de saída numa aba no `memory.spec.ts`.

- [ ] T020 [P] [US4] [Claude] Vitest em `frontend/src/features/terminal/writeQueue.test.ts`: "marca alta 2 MiB → pede pause (uma vez)", "marca baixa 512 KiB → pede resume (uma vez)", fechar a aba com pausa pendente chama resume
- [ ] T021 [US4] [Claude] `frontend/src/features/terminal/writeQueue.ts` e uso no `attach` de `TerminalView.tsx` (depende de T006)
- [ ] T022 [US4] [Claude] Cenário de 5 min em `memory.spec.ts`: heap varia ≤ 10 MB entre min 2 e 5; histórico ≥ 10.000 linhas; eco de tecla em outra aba ≤ 50 ms p95

## Phase 7: User Story 5 — Medição repetível (P3)

- [ ] T023 [US5] [Claude] `memory.spec.ts` com todas as metas, tolerância da T002 e relatório final em `test-results/memory.md`; documentar como rodar em `specs/014-desempenho/quickstart.md`

## Phase 7b: Opção de GPU (descoberta da T018)

- [X] T027 [US3] [Codex] Preferência `gpuRendering` (bool, padrão `false`) em `internal/appwin/preferences.go` e no `case` de `internal/bridge/app.go` (mesmo caminho de `boldBright`); não sincroniza (depende da placa de vídeo de cada computador)
- [ ] T028 [US3] [Claude] Interruptor "Aceleração por GPU" em Configurações → Terminal, com texto dizendo que usa mais memória; trocar vale para as abas que aparecerem depois

## Phase 8: Polish

- [ ] T024 [Claude] Rodar a suíte e2e completa sem Docker + Vitest + lint + typecheck; registrar números finais em `specs/014-desempenho/validation.md` (tabela antes/depois)
- [ ] T025 [Claude] Revisão de segurança (Princípio II): Pause/Resume só aceitam id; nada de dados do cofre em relatórios; Argon2 inalterado
- [ ] T026 [Claude] Notas de versão em `docs/release-notes/` (seção desempenho)

## Dependencies

- T001–T002 antes de qualquer meta (T010, T016, T019, T022, T023).
- T003 → T004 → T005 → T006 → T021.
- US1 (Codex) e US2 (Claude) correm em paralelo; US3 depende de T014; US4 depende de T006.

## Parallel examples

- Codex: T003–T005 e T007–T009 enquanto Claude faz T001–T002 e T011–T015.
- Claude: T011 ∥ T013 ∥ T020 (arquivos de teste diferentes).

## Implementation Strategy

MVP = US2 (maior ganho: GPU e retenção) + US1 (pico do Argon2). Medir depois de cada história e
parar quando SC-1401..SC-1405 passarem.

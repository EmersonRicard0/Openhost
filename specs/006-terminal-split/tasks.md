# Tasks: Grupos de terminais na mesma janela (tela dividida)

**Input**: Design documents from `specs/006-terminal-split/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). O módulo de layout e as transições do store
ganham testes antes do código; o e2e roda contra o app real com terminais locais.

**Divisão**: feature inteira do Claude (só frontend). Commits sem `Co-Authored-By`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário (US1–US4 da spec)

---

## Phase 1: Foundational (layout puro e store)

**Checkpoint**: `npx vitest run src/features/terminal/layout.test.ts src/stores/sessions.test.ts` verde.

- [X] T001 Testes em `frontend/src/features/terminal/layout.test.ts` para `insert` (quatro lados, `ratio` 0,5), `remove` (irmão sobe; `null` com uma folha), `move`, `setRatio` limitado, `equalize`, `leaves`, `rects` (frações somam 1, divisórias entre os retângulos), `neighbor` nas quatro direções num 2×2 e num "1 grande + 2", e `dropVerdict` (`ok`, `full` com 4, `group`, `sftp`, `tooSmall`, `self`). Depois implementar `frontend/src/features/terminal/layout.ts` (data-model.md, research R2, R5).
- [X] T002 Testes em `frontend/src/stores/sessions.test.ts` para as transições de data-model.md: `join(dragId, targetId, side)`, `splitOut(id, beforeStripIndex?)`, `removeFromGroup` ao fechar sessão, grupo desfeito com uma sessão, `stripItems()` derivada na ordem de `tabs` (grupo na posição do primeiro membro), `cycleTab` pulando membros do mesmo grupo, `groupOf(id)`. Depois implementar em `frontend/src/stores/sessions.ts` (`groups`, ações e seletores).

---

## Phase 2: User Story 1 - Juntar sessões arrastando a aba (Priority: P1) 🎯 MVP

**Goal**: arrastar uma aba sobre o terminal de outra e soltar num dos quatro lados.

**Independent Test**: quickstart §2, cenários 1 e 2.

- [X] T003 [US1] `TerminalView` em `frontend/src/features/terminal/TerminalView.tsx`: trocar `active` por `visible` (mede, faz `fit`, manda `resize`) e `focused` (teclado, cursor, destaque), sem mudar o comportamento de abas avulsas; `testProbe` continua funcionando.
- [X] T004 [US1] `Workspace` em `frontend/src/features/terminal/Workspace.tsx`: para a aba ativa que é grupo, posicionar cada `TerminalView` membro por `rects()` (porcentagens, descontando 1 px de divisória e 24 px de cabeçalho); membros visíveis, os demais ocultos como hoje; nenhum terminal muda de pai no DOM (research R3).
- [X] T005 [US1] `DropLayer` em `frontend/src/features/terminal/DropLayer.tsx`: aparece em `dragenter` de aba/cabeçalho na área dos terminais, calcula painel e lado pela borda mais próxima, mostra `data-drop-preview` com `data-side`, chama `dropVerdict` e mostra o motivo em `role="status"` quando recusado (textos em contracts/ui.md, em `frontend/src/i18n/pt-BR.ts`); `drop` chama `join`; Esc ou sair cancela.
- [X] T006 [US1] `TabBar` em `frontend/src/features/terminal/TabBar.tsx`: renderizar `stripItems()`; item de grupo com título do painel ativo, selo com a quantidade, nome acessível "<título> e mais N" e indicador do pior estado (FR-611); itens de grupo não abrem zonas de soltura ao serem arrastados.
- [X] T007 [US1] E2e `frontend/tests/e2e/split.spec.ts`: cenários 1 e 2 do quickstart (juntar dois `cmd` à direita, mesmo id de sessão antes e depois, `echo` nos dois; repetir até 4; a quinta recusada com a mensagem).

**Checkpoint**: grupos montados por arrasto; foco por clique já funciona via `activate`.

---

## Phase 3: User Story 2 - Foco, tamanho e destaque (Priority: P1)

**Goal**: painel ativo destacado, foco por clique e teclado, divisórias ajustáveis.

**Independent Test**: quickstart §2, cenários 3 e 4.

- [X] T008 [US2] `PaneHeader` em `frontend/src/features/terminal/PaneHeader.tsx` (ícone, título, estado, botões "Separar em nova aba" e "Fechar painel"; sem ações ainda ligadas além de foco) e destaque do painel ativo (`data-focused`, borda na cor de destaque) em `frontend/src/features/terminal/terminal.module.css`; clique em qualquer ponto do painel o ativa (FR-606, FR-610).
- [X] T009 [US2] `Divider` em `frontend/src/features/terminal/Divider.tsx`: arrasto por ponteiro com `setPointerCapture`, `setRatio` limitado pelo mínimo (R5), dois cliques e Enter igualam, setas mudam 5%, `role="separator"` com `aria-valuenow`; `fit` por quadro durante o arrasto (FR-608, FR-609).
- [X] T010 [US2] Atalhos `focusLeft/Right/Up/Down` em `frontend/src/app/shortcuts.ts` (padrões de contracts/ui.md, Windows/Linux e macOS), rótulos em `frontend/src/i18n/pt-BR.ts`, ação `focusDir` em `frontend/src/features/terminal/commands.ts` usando `neighbor`; testes em `frontend/src/app/shortcuts.test.ts` (sem conflito com os padrões existentes).
- [X] T011 [US2] Busca, copiar, colar, zoom e enviar teclas miram o painel ativo: conferir `activeTerminalId()` e o `SearchBar` dentro do painel em `frontend/src/features/terminal/commands.ts` e `TerminalView.tsx` (FR-606).
- [X] T012 [US2] E2e em `frontend/tests/e2e/split.spec.ts`: divisória arrastada mantém `ServerSizeOf` igual ao xterm de cada painel; `Ctrl+Alt+Setas` move o foco e a digitação vai para o painel `data-focused`.

**Checkpoint**: SC-603 e SC-604 verificados.

---

## Phase 4: User Story 3 - Separar e fechar (Priority: P2)

**Goal**: desfazer o grupo sem perder sessões; fechar painel ou grupo com confirmação.

**Independent Test**: quickstart §2, cenários 5 e 6.

- [X] T013 [US3] Ligar "Separar em nova aba" (cabeçalho e menu de contexto do painel) a `splitOut`; arrastar o cabeçalho (`application/x-shellvault-pane`) para a barra de abas separa naquela posição (FR-612).
- [X] T014 [US3] Fechar painel (botão, atalho "fechar aba" com grupo ativo) e fechar a aba do grupo: em `frontend/src/features/terminal/commands.ts` e no diálogo de confirmação existente (`CloseTabConfirm` em `Workspace.tsx`), com a contagem de sessões vivas no texto quando forem várias (FR-613, FR-614); i18n.
- [X] T015 [US3] Sessão que cai ou termina dentro do grupo continua no painel com a faixa de estado e "Reconectar" (`Banner` atual), sem desfazer o grupo.
- [X] T016 [US3] E2e em `frontend/tests/e2e/split.spec.ts`: separar devolve aba com o mesmo conteúdo e id; fechar painel encerra só aquela sessão; com uma restante, a aba volta a ser comum.

---

## Phase 5: User Story 4 - Reorganizar dentro do grupo (Priority: P3)

- [X] T017 [US4] Arrastar o cabeçalho de um painel sobre outro painel do mesmo grupo usa o `DropLayer` e chama `move` (FR-615); teste de store em `sessions.test.ts` e um cenário no e2e.

---

## Phase 6: Polish & Cross-Cutting

- [X] T018 [P] Atualizar `specs/002-wails-migration/contracts/bridge.md`? Não há mudança na ponte; registrar só em `docs/` de atalhos se existir a lista de atalhos documentada (conferir `README.md`).
- [X] T019 Acessibilidade: nomes de painel, separador focável, anúncio do painel ativo; conferir com o snapshot de acessibilidade do Playwright.
- [X] T020 Rodar quickstart §1–§2 e registrar em `specs/006-terminal-split/validation.md`; §3 (SSH real) como pendência do usuário.
- [ ] T021 CI verde nos três sistemas.

---

## Dependencies & Execution Order

- Foundational (T001–T002) → US1 (T003–T007) → US2 (T008–T012) → US3 (T013–T016) → US4 (T017) → Polish.
- T001 e T002 podem ser escritos em paralelo (arquivos diferentes), mas T002 usa `layout.ts`.
- Dentro de US1: T003 antes de T004; T005 e T006 em paralelo depois de T004.

## Implementation Strategy

1. MVP: Foundational + US1 + US2 (juntar, focar, redimensionar) — já é usável.
2. US3 fecha o ciclo de vida; US4 é conveniência.

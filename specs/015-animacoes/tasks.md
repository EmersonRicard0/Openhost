---
description: "Tarefas da feature 015 — animações"
---

# Tasks: Animações na abertura, nos cliques e nos terminais

**Input**: `specs/015-animacoes/` (plan.md, spec.md, research.md, data-model.md, contracts/ui-motion.md, quickstart.md)

**Tests**: incluídos (Princípio IV da constituição). e2e abre o app e pega o foco: avisar o usuário antes de rodar.

**Divisão**: tarefas marcadas **(Codex)** são Go e vão para a fila `.agente-queue/`; o resto é frontend (Claude).

## Phase 1: Setup

- [ ] T001 Criar `frontend/tests/e2e/motion.spec.ts` vazio com o `describe('015 animações')` e o helper que força `motion` via preferência do app de teste (reaproveitar `frontend/tests/e2e/helpers`)
- [ ] T002 [P] Adicionar `motion: 'system' | 'full' | 'reduced' | 'off'` ao tipo de preferências em `frontend/src/shared/model/types.ts` e o padrão `'system'` onde o store monta as preferências em `frontend/src/stores/ui.ts`

## Phase 2: Foundational (bloqueia todas as histórias)

- [ ] T003 (Codex) Teste em `internal/appwin/preferences_test.go`: `motion` ausente, vazio ou desconhecido → `"system"`; aceita só `system`, `full`, `reduced`, `off`; `SyncPreferencesFrom`/`SyncPreferences` em `internal/cloudsync/items.go` NÃO levam `motion`
- [ ] T004 (Codex) Campo `Motion string \`json:"motion"\`` em `Preferences` e `UpdatePrefs` de `internal/appwin/preferences.go`, padrão `"system"` em `DefaultPreferences`, normalização em `normalizedPreferences`/`normalizedUpdatePrefs`; regenerar bindings Wails (`frontend/wailsjs`)
- [ ] T005 [P] Teste Vitest de `resolveMotion(pref, systemReduced)` em `frontend/src/ui/motion.test.ts` cobrindo a tabela do data-model (`system`+não→`full`, `system`+sim→`reduced`, `full`/`reduced`/`off` fixos)
- [ ] T006 Implementar `resolveMotion` e `applyMotion(level)` (define `document.documentElement.dataset.motion`) e `watchMotion(getPref)` (escuta `matchMedia('(prefers-reduced-motion: reduce)')`) em `frontend/src/ui/motion.ts`
- [ ] T007 Em `frontend/src/main.tsx`, chamar `applyMotion` com as preferências carregadas antes do `render`, e reaplicar quando `stores/ui.ts` mudar `motion`
- [ ] T008 Em `frontend/src/styles/global.css`: `--motion-shift: 1` em `:root`; `[data-motion="reduced"] { --motion-shift: 0 }`; `[data-motion="off"] { --motion-fast/base/slow: 0ms; --motion-shift: 0 }`; manter o `@media (prefers-reduced-motion)` só como fallback quando não houver `data-motion`; keyframes de deslocamento/escala existentes (`pop-in`, `slide-in`, `page-in`, `section-in`, `card-in`, `palette-in`…) passam a multiplicar distância/escala por `var(--motion-shift)`
- [ ] T009 Trocar os `@media (prefers-reduced-motion: reduce)` dos módulos por seletores `:root[data-motion="off"]`/`[data-motion="reduced"]` em `frontend/src/features/hosts/*.module.css`, `features/importexport`, `features/palette/palette.module.css`, `features/settings/settings.module.css`, `features/sftp/sftp.module.css`, `features/terminal/terminal.module.css`, `features/updates`; e o `matchMedia` de `frontend/src/features/terminal/TabBar.tsx:482` por leitura de `document.documentElement.dataset.motion`
- [ ] T010 Rodar `node scripts/check-tokens.mjs`, `npm run lint`, `npm run typecheck`, `npx vitest run` em `frontend/`

**Checkpoint**: `data-motion` funciona e nada mudou visualmente com `full`.

## Phase 3: User Story 1 — Abertura com a marca (P1) 🎯 MVP

**Goal**: marca desde o primeiro quadro, sem atrasar o campo de senha.
**Independent Test**: abrir o app: fundo preto piano + chevron no primeiro quadro; senha com foco assim que pronta (quickstart 1–2).

- [ ] T011 [P] [US1] e2e em `frontend/tests/e2e/motion.spec.ts`: `#boot` existe no documento inicial; some (removido do DOM) depois que `#unlock-password` aparece; `#unlock-password` tem foco; nenhuma ação espera o `#boot`
- [ ] T012 [P] [US1] Teste Vitest de `dismissBoot()` em `frontend/src/ui/motion.test.ts`: marca `data-leaving`, remove no `transitionend` ou após teto de 300 ms, idempotente, não falha sem `#boot`
- [ ] T013 [US1] Em `frontend/index.html`: `<div id="boot" aria-hidden="true">` com SVG inline do chevron (de `brand/kit/openhost-mark.svg`, cor `#FD7B17`) centralizado sobre `#050505`, `<style>` inline com entrada ≤ 600 ms (opacidade + escala leve), depois pulso discreto de opacidade (FR-1507), `@media (prefers-reduced-motion: reduce)` só opacidade; `#boot[data-leaving]` esmaece em 200 ms com `pointer-events: none`; `html, body { background: #050505 }`. Sem script inline (CSP)
- [ ] T014 [US1] Implementar `dismissBoot()` em `frontend/src/ui/motion.ts` e chamá-lo no `useEffect` de montagem da primeira tela (desbloqueio, criação do cofre, lista de hosts) em `frontend/src/App.tsx` (ou componente raiz equivalente), depois do foco no primeiro campo
- [ ] T015 [US1] (Codex) `BackgroundColour: &options.RGBA{R: 5, G: 5, B: 5, A: 255}` em `main.go:96` (fundo nativo preto piano, SC-1502)
- [ ] T016 [US1] Adicionar exceção do `#boot` em `scripts/check-tokens.mjs` se o `index.html` for verificado (cores literais só ali, por estar fora dos tokens)

**Checkpoint**: US1 entregue sozinha.

## Phase 4: User Story 2 — Resposta imediata ao clicar (P1)

**Goal**: pressionado visível no quadro seguinte; ações demoradas sem clique duplo.
**Independent Test**: quickstart 3.

- [ ] T017 [P] [US2] Teste Vitest de `useBusyAction` em `frontend/src/ui/useBusyAction.test.ts`: segunda chamada com a primeira pendente é ignorada; `busy` volta a `false` em sucesso e erro; erro repassado
- [ ] T018 [P] [US2] e2e em `frontend/tests/e2e/motion.spec.ts`: clicar duas vezes rápido num host do sshd abre uma única aba; o item tem `aria-busy="true"` enquanto conecta
- [ ] T019 [US2] Criar `frontend/src/ui/useBusyAction.ts` (retorna `[run, busy]`, ref síncrona contra corrida) e `pressProps()` que põe `data-pressed` em Enter/espaço (keydown) e tira no keyup/blur
- [ ] T020 [US2] Estado pressionado em `frontend/src/ui/ui.module.css` para Button, itens de Menu e Segmented: `:active, [data-pressed]` → `transform: scale(calc(1 - 0.03 * var(--motion-shift)))` + fundo `--surface-pressed` (criar token em `frontend/src/styles/theme/base.css`); `[data-busy]` com `Spinner` pequeno e cursor `progress`; aplicar `pressProps` em `frontend/src/ui/Button.tsx` e `frontend/src/ui/Menu.tsx`
- [ ] T021 [US2] Pressionado nos itens de host (`frontend/src/features/hosts/HostList.tsx` + módulo CSS), abas (`frontend/src/features/terminal/TabBar.tsx` + `terminal.module.css`), paleta (`frontend/src/features/palette/CommandPalette.tsx` + `palette.module.css`) e cartões da Home (`frontend/src/features/home/HostCard.tsx` + `home.module.css`)
- [ ] T022 [US2] Usar `useBusyAction` em conectar (`frontend/src/features/hosts/connect.ts` chamado de HostList/HostCard/QuickConnectBar), salvar host, sincronizar agora (`frontend/src/stores/sync.ts` → botão em Configurações), importar/exportar (`frontend/src/features/importexport`) e verificar atualização (`frontend/src/features/updates`)

## Phase 5: User Story 3 — Terminais que entram e saem sem pular (P2)

**Goal**: abas e painéis animados; digitação nunca espera.
**Independent Test**: quickstart 4–7.

- [ ] T023 [P] [US3] e2e em `frontend/tests/e2e/motion.spec.ts`: 20× abrir aba local e digitar `echo ok` imediatamente → 20 saídas `ok` (SC-1504)
- [ ] T024 [P] [US3] Teste Vitest em `frontend/src/features/terminal/fitOnce.test.ts`: durante uma transição marcada, vários resize → um único `fit()` no fim (ou no teto `--motion-slow` + 50 ms)
- [ ] T025 [P] [US3] e2e em `frontend/tests/e2e/split.spec.ts`: dividir painel gera exatamente 1 `resize` na sessão (via `frontend/src/features/terminal/testProbe.ts`) (SC-1505)
- [ ] T026 [P] [US3] e2e em `frontend/tests/e2e/motion.spec.ts`: conectar no sshd mostra `[data-testid="connecting"]` até o diálogo de chave do servidor; host inexistente → indicador some quando o erro aparece
- [ ] T027 [US3] Entrada da aba nova em `frontend/src/features/terminal/TabBar.tsx` + `terminal.module.css`: keyframe `tab-in` (largura máxima 0→auto via `max-width`, opacidade 0→1, ≤ `--motion-base`); terminal monta e recebe foco no mesmo commit (sem esperar `animationend`)
- [ ] T028 [US3] Fechar aba: usar `leaveGhost` de `frontend/src/ui/motion.ts` para clonar a aba fechada e encolher; vizinhas deslizam com FLIP (`transform` por `var(--motion-shift)`); o estado do store muda na hora (FR-1504)
- [ ] T029 [US3] Criar `frontend/src/features/terminal/fitOnce.ts` (agenda `fit` único após `transitionend` do painel ou teto) e usá-lo no `ResizeObserver` de `frontend/src/features/terminal/TerminalView.tsx:172` e em `terminalRegistry.ts:32`; painel novo em `Workspace.tsx`/`layout` cresce de `flex-grow: 0` ao valor final com `transition: flex-grow var(--motion-base)`
- [ ] T030 [US3] Indicador "conectando" em `frontend/src/features/terminal/TerminalView.tsx` (ou `PaneHeader.tsx`): sobreposição `data-testid="connecting"` com chevron pulsando (tokens da marca) enquanto `session.state === 'connecting'` e nenhum byte chegou (`dataBus.ts`); some no primeiro dado, pedido (`HostKeyDialog`/`PromptDialog`), erro ou fechamento; animação só existe enquanto visível (FR-1520)
- [ ] T031 [US3] Garantir troca de aba instantânea (sem fade no conteúdo) e cor do ambiente presente desde o primeiro quadro em `terminal.module.css` (FR-1513/1514)

## Phase 6: User Story 4 — Diálogos, Configurações e avisos coerentes (P3)

**Goal**: mesmo padrão de entrada/saída em tudo.
**Independent Test**: abrir/fechar cada superfície e conferir duração ≤ 250 ms e curvas da marca.

- [ ] T032 [P] [US4] Padronizar entrada/saída (`pop-in`/`pop-out` com `--ease-emphasized`/`--ease-exit`) em `frontend/src/ui/Dialog.tsx` + `ui.module.css`, `ConfirmDialog.tsx`, `Popover.tsx`, `Toast.tsx`
- [ ] T033 [P] [US4] Aba de Configurações (`frontend/src/features/settings/settings.module.css`), paleta (`palette.module.css`), aviso de atualização (`frontend/src/features/updates`), painel SFTP (`sftp.module.css`, `TransferPanel.tsx`) usando os mesmos keyframes
- [ ] T034 [US4] Entrada escalonada só dos primeiros itens visíveis (máx. 8, total ≤ 250 ms, `animation-delay` por `--i`) em `frontend/src/features/hosts/HostList.tsx` e `frontend/src/features/home/HomeScreen.tsx`, sem `pointer-events: none` (FR-1516)

## Phase 7: User Story 5 — Escolher o quanto de animação (P3)

**Goal**: Completas / Reduzidas / Desligadas (padrão do sistema), local.
**Independent Test**: quickstart 8.

- [ ] T035 [P] [US5] e2e em `frontend/tests/e2e/motion.spec.ts`: com `Desligadas`, nenhum elemento visível com `animation-duration`/`transition-duration` ≠ `0s`; com `Reduzidas`, nenhum `transform` animado; escolha persiste após reiniciar
- [ ] T036 [US5] Em `frontend/src/features/settings/SettingsPage.tsx` › Aparência: `Segmented` "Animações" com Sistema / Completas / Reduzidas / Desligadas, salvando via `UpdatePreferences({ motion })` e aplicando na hora; textos em `frontend/src/i18n/pt-BR.ts`
- [ ] T037 [US5] `Desligadas`: conferir que o pressionado vira só troca de cor (T020) e que `#boot` some sem transição quando `data-motion="off"` (FR-1519)

## Phase 8: Polish

- [ ] T038 Parar animações com a janela oculta: `document.visibilitychange` → `data-hidden` em `<html>` com `animation-play-state: paused` em `global.css` (FR-1520)
- [ ] T039 Medição SC-1501/SC-1506 com o método da 014 (10 aberturas `full` × `off`; CPU em repouso minimizado) — pedir ao usuário antes; registrar em `specs/015-animacoes/quickstart.md`
- [ ] T040 Rodar suíte: `node scripts/check-tokens.mjs`, lint, typecheck, Vitest, `go test ./...`, e2e (`motion`, `noc-ui`, `split`, `ui-polish`, `appearance`) — e2e só com aviso
- [ ] T041 Notas de versão em `docs/release-notes/0.9.0.md` (animações + preferência)

## Dependencies & Execution Order

- Phase 1 → Phase 2 (T003–T004 Codex em paralelo com T005–T009) → histórias.
- US1 e US2 (P1) independentes entre si após a Phase 2. US3 depende só da Phase 2 (usa `leaveGhost` existente). US4 depende de T008. US5 depende de T004 + T007.
- T015 (Codex) pode ir junto com T003–T004 no mesmo cartão.

## Parallel Examples

- Phase 2: T005 ∥ T003/T004 (Codex).
- US1: T011 ∥ T012, depois T013 → T014.
- US2: T017 ∥ T018, depois T019 → T020 → T021/T022.
- US3: T023 ∥ T024 ∥ T025 ∥ T026, depois T027 → T028; T029 e T030 em paralelo (arquivos diferentes, exceto `TerminalView.tsx` — fazer em sequência).
- US4: T032 ∥ T033.

## Implementation Strategy

MVP = Phase 1–2 + US1 (abertura com a marca). Depois US2 (cliques), US3 (terminais), US4, US5 e Polish; cada história validada pelo quickstart antes da próxima.

# Implementation Plan: Grupos de terminais na mesma janela (tela dividida)

**Branch**: `006-terminal-split` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-terminal-split/spec.md`

## Summary

Permitir juntar até 4 sessões de terminal numa aba, arrastando uma aba sobre o terminal de outra
e escolhendo o lado, com divisórias ajustáveis, foco por clique e teclado, separar e fechar
painéis. Implementação só no frontend: o store de sessões ganha grupos com uma árvore binária de
divisões; os terminais continuam numa lista plana posicionada por coordenadas, para nunca
remontar o xterm; o redimensionamento por sessão que já existe faz o resto. Decisões em
[research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript `strict`, React 19; Go 1.26 sem mudanças

**Primary Dependencies**: xterm.js e `@xterm/addon-fit` (já usados), Zustand; nenhuma nova

**Storage**: nenhum (grupos só em memória); atalhos novos no mapa de atalhos existente

**Testing**: Vitest (layout e store), Playwright contra o app real (`split.spec.ts`)

**Target Platform**: Windows 10/11, Linux (WebKitGTK 4.1), macOS 12+

**Project Type**: app desktop (Go + webview)

**Performance Goals**: divisória acompanha o ponteiro a cada quadro; `resize` só quando o
tamanho em células muda

**Constraints**: nenhum terminal remontado ou reconectado ao juntar/separar/reorganizar; mínimo
de 20×5 células por painel; até 4 painéis

**Scale/Scope**: ~4 componentes novos (painel, cabeçalho, divisória, camada de soltura), 1
módulo puro de layout, ajustes em `Workspace`, `TabBar`, `TerminalView`, `commands`, `shortcuts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ Comportamento comum a terminais com divisão; nada copiado. |
| II. Segurança | ✅ Sem mudança na ponte, no cofre ou em autenticação; nenhum dado novo sai do frontend. Fechar o grupo usa a confirmação existente. |
| III. Local-First | ✅ Nada persistido além dos atalhos (preferências locais já existentes). |
| IV. Testes Primeiro | ✅ Módulo `layout.ts` e transições do store com testes antes; e2e com o app real cobrindo SC-602/603/604/605. |
| V. Simplicidade | ✅ Sem biblioteca de layout (R4); árvore binária mínima; nenhuma mudança no Go. |
| Plataformas | ✅ Só frontend; atalhos por sistema seguem o padrão existente (⌘ no macOS). |

Sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/006-terminal-split/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
frontend/src/
├── features/terminal/
│   ├── layout.ts / layout.test.ts     # árvore, rects, neighbor, dropVerdict (puro)
│   ├── Workspace.tsx                  # posiciona TerminalView por rects; divisórias; camada de soltura
│   ├── PaneHeader.tsx                 # título, estado, separar, fechar; arrastável
│   ├── Divider.tsx                    # divisória com ponteiro e teclado
│   ├── DropLayer.tsx                  # prévia e recusas durante o arrasto
│   ├── TerminalView.tsx               # active → visible + focused
│   ├── TabBar.tsx                     # itens de grupo; soltar cabeçalho separa
│   ├── commands.ts                    # focusDir, closeActiveTab no grupo, cycleTab por item
│   └── terminal.module.css
├── stores/sessions.ts / sessions.test.ts  # groups, join, split-out, closePane, strip derivada
├── app/shortcuts.ts                   # focusLeft/Right/Up/Down
└── i18n/pt-BR.ts
frontend/tests/e2e/split.spec.ts
```

**Structure Decision**: tudo em `frontend/`, dentro de `features/terminal` e `stores/sessions`,
seguindo a organização atual. Sem tarefas para o Codex: a feature é inteira do Claude.

## Post-Design Constitution Check

Reavaliado após research, data-model e contrato: sem novos riscos; a superfície da ponte não muda.

## Complexity Tracking

Sem violações a justificar.

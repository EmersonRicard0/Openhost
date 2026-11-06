# Implementation Plan: Digitar no grupo inteiro e biblioteca de comandos

**Branch**: `012-broadcast-snippets` | **Date**: 2026-10-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/012-broadcast-snippets/spec.md`

## Summary

Duas metades. **Transmissão** é só frontend: a fila de escrita por sessão sai do `TerminalView`
para um módulo próprio, e o painel ativo de um grupo com o modo ligado manda a mesma entrada para
a fila de cada painel marcado; estado no grupo do store `sessions`, avisos de produção e de
colagem reaproveitando ambientes (009) e o diálogo de colagem (002). **Biblioteca** pede Go:
`model.Snippet` numa tabela nova do cofre (migração 2 → 3), `SnippetService` na ponte, item
`snippet` na sincronização (com leitor tolerante a tipos desconhecidos) e OpenHost v3. Campos
`{nome}`, filtro por tags e envio pela paleta são frontend. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26; TypeScript `strict`, React 19

**Primary Dependencies**: Wails 2.17, xterm.js, Zustand (já usados); nenhuma nova

**Storage**: cofre SQLite cifrado — tabela nova `snippets (id, sealed)`, `SchemaVersion` 3;
transmissão e últimos valores de campos só em memória

**Testing**: `go test` (model, domain/snippets, vault com migração 3, cloudsync, exporter,
importer, bridge); Vitest (`writer`, destinos da transmissão, `paste`, `fields`, ordenação por
tags); Playwright (`broadcast-snippets.spec.ts` + `split`, `sync`, `import-export`)

**Target Platform**: Windows 10/11, Linux (WebKitGTK 4.1), macOS 12+

**Project Type**: app desktop (Go + webview)

**Performance Goals**: tecla nos outros painéis < 50 ms além do ativo (SC-1202); busca em 500
comandos < 100 ms por tecla (SC-1205)

**Constraints**: nenhuma tecla perdida, repetida ou fora de ordem por sessão (SC-1201); nada sai
para sessão fora do grupo, desmarcada ou de produção sem confirmação (SC-1203); texto de comando
fora de logs e erros

**Scale/Scope**: Go — `model`, `domain/snippets.go` (novo), `vault` (schema, rows, store),
`bridge/snippets.go` (novo), `cloudsync/items.go` + `syncer.go`, `exporter`/`importer` OpenHost,
`bridge/export.go`. Frontend — `terminal/writer.ts` (novo), `TerminalView`, `PaneHeader`,
`TabBar`, `Workspace`, `paste.ts`, `stores/sessions.ts`, `app/shortcuts.ts`, paleta,
`features/snippets/` (novo: `fields.ts`, `SnippetsSettings.tsx`, `FieldsDialog.tsx`,
`BroadcastConfirm.tsx`), store `snippets` (novo), exportação/importação

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ Transmitir para vários terminais e biblioteca de comandos são recursos comuns de terminais; nomes, textos e visual próprios. |
| II. Segurança | ✅ Comandos no cofre cifrado (JSON selado), só saem pela sincronização já consentida e pela exportação. Valores de campos só em memória (FR-1217). Transmissão não cria caminho novo de escrita: usa `Write` existente e só para membros do grupo, com confirmação para produção e colagem. **Revisão de segurança**: toca cofre (migração), ponte (serviço novo) e sincronização → revisar validação no Go, texto fora de logs/erros, e que nenhum caminho envie a uma sessão fora do grupo. |
| III. Local-First | ✅ Tudo offline. Migração numerada 2 → 3 com teste; versão antiga mostra o aviso de cofre mais novo sem apagar. OpenHost versionado (v3). Leitor da nuvem passa a preservar tipos desconhecidos (R6). |
| IV. Testes Primeiro | ✅ Validação de snippet, migração, ida e volta de sync/exportação, parser de campos e destinos da transmissão com testes antes; e2e por história. |
| V. Simplicidade | ✅ Sem dependência nova nem método novo de sessão; a única abstração nova (`writer.ts`) substitui a fila local que já existe. Snippets fora do MVP da 002 — esta spec é a aprovação. |
| Plataformas | ✅ Nada específico de sistema; atalho padrão por plataforma como os demais. |

Sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/012-broadcast-snippets/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/bridge.md
├── contracts/ui.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
internal/
├── model/model.go                 # Snippet; Content.Snippets
├── domain/snippets.go             # validação, campos (R8), Duplicate
├── vault/schema.go, rows.go, store.go   # migração 2→3, CRUD selado, sync apply
├── bridge/snippets.go             # SnippetService + evento snippets:changed
├── bridge/export.go               # includeSnippets, contagem
├── cloudsync/items.go, syncer.go  # item snippet; tipos desconhecidos preservados
├── exporter/openhost.go           # Version 3
└── importer/openhost.go           # v1–v3; repetido pular/cópia
frontend/src/
├── features/terminal/writer.ts (+ test)        # fila por sessão
├── features/terminal/broadcast.ts (+ test)     # destinos, regras de produção
├── features/terminal/TerminalView.tsx, PaneHeader.tsx, TabBar.tsx, Workspace.tsx, paste.ts
├── features/snippets/fields.ts (+ test), SnippetsSettings.tsx, FieldsDialog.tsx
├── features/palette/                           # grupo Comandos, Enter/Shift+Enter
├── stores/sessions.ts (broadcast), snippets.ts (novo)
├── app/shortcuts.ts                            # ação broadcast
└── i18n/pt-BR.ts
frontend/tests/e2e/broadcast-snippets.spec.ts
```

**Structure Decision**: Go para o Codex pela fila (`.agente-queue/`, worktree `shellvault-codex`,
branch `012-codex-backend` a partir de `012-broadcast-snippets`), em um card: modelo, validação,
migração, serviço, sincronização tolerante e OpenHost v3, com testes e bindings regenerados.
Frontend, e2e e revisão de segurança com o Claude. A transmissão (US1, US2) não depende do Go e
começa antes; a biblioteca (US3–US6) começa com o store usando os tipos do contrato.

## Post-Design Constitution Check

Reavaliado após research, data-model e contratos: a ponte ganha um serviço com validação no Go e
nenhum caminho novo de escrita em sessão; a migração é numerada e testada; o leitor da nuvem
fica mais tolerante sem aceitar item inválido de tipo conhecido. Revisão de segurança como tarefa
explícita antes do merge. Sem novos riscos.

## Complexity Tracking

Sem violações a justificar.

# Implementation Plan: Tela inicial e conexão rápida

**Branch**: `010-quick-connect` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-quick-connect/spec.md`

## Summary

A tela vazia vira um início: barra de conexão rápida (`user@host:porta`, com sugestões de hosts
salvos), favoritos e recentes em cards. No Go: `SessionService.OpenQuick` (sessão SSH sem host
salvo, autenticação por agente e senha pedida a cada conexão), `favorite` no host e a lista local
`recents` nas preferências. O resto é frontend. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26; TypeScript `strict`, React 19

**Primary Dependencies**: Wails 2.17, Zustand (já usados); nenhuma nova

**Storage**: `favorite` no JSON selado do host; `recents` em `appwin.Preferences` (local)

**Testing**: `go test` (bridge, domain, appwin); Vitest (`quickTarget`, recentes); Playwright
(`home.spec.ts`, varredura de segredos)

**Target Platform**: Windows 10/11, Linux (WebKitGTK 4.1), macOS 12+

**Project Type**: app desktop (Go + webview)

**Performance Goals**: tela inicial em até 100 ms após fechar a última aba; sugestões enquanto se
digita com 500 hosts

**Constraints**: nenhuma senha de conexão rápida persistida nem enviada em argumento da ponte

**Scale/Scope**: Go — `bridge/sessions.go` (`OpenQuick`), `model`/`domain` (`favorite`),
`appwin/preferences.go` e `bridge/app.go` (`recents`, `recordRecent`), exportação. Frontend —
`HomeScreen`, `QuickConnectBar`, `HostCard`, `quickTarget.ts`, `recents.ts`, `Workspace`,
`TabBar` (menu "Salvar como host"), `HostList` (menu favoritar), `shortcuts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ Barra de conexão e recentes são padrões comuns; textos e visual próprios. |
| II. Segurança | ✅ A conexão rápida passa pela mesma verificação de chave do servidor; a senha só trafega pelo prompt existente e nunca é guardada (R1). A ponte ganha `OpenQuick` (validado no Go) e `recordRecent` (sem segredo). **Revisão de segurança**: nova superfície de ponte → revisar validação de alvo, ausência de senha em recentes, logs e eventos, e varredura de segredos no e2e. |
| III. Local-First | ✅ Recentes ficam só na máquina; nada novo sai dela. |
| IV. Testes Primeiro | ✅ `parseTarget`, recentes e `OpenQuick` com testes antes; e2e contra o SSH de teste. |
| V. Simplicidade | ✅ Sem dependência nova; reaproveita "Perguntar ao conectar" e a busca da lateral. |
| Plataformas | ✅ ⌘L no macOS pelo mapa de atalhos existente. |

Sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/010-quick-connect/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/bridge.md
├── contracts/ui.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
internal/
├── bridge/sessions.go             # OpenQuick
├── bridge/app.go                  # recents, recordRecent
├── appwin/preferences.go          # Recents
├── model/model.go, domain/hosts.go  # Host.Favorite
└── exporter, importer             # favorite no formato v2
frontend/src/
├── features/home/HomeScreen.tsx, QuickConnectBar.tsx, HostCard.tsx, home.module.css
├── features/home/quickTarget.ts / quickTarget.test.ts
├── features/home/recents.ts / recents.test.ts
├── features/hosts/connect.ts      # connectQuick; registra recente ao conectar
├── features/hosts/HostList.tsx    # Favoritar
├── features/terminal/Workspace.tsx, TabBar.tsx
├── app/shortcuts.ts               # focusQuickConnect
└── i18n/pt-BR.ts
frontend/tests/e2e/home.spec.ts
```

**Structure Decision**: Go em um card do Codex (73-010F) depois do 72; o frontend começa já
(parser, tela, cards e sugestões não dependem do Go).

## Post-Design Constitution Check

Reavaliado: a revisão de segurança da nova chamada da ponte fica como tarefa explícita. Sem
violações.

## Complexity Tracking

Sem violações a justificar.

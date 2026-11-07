# Implementation Plan: Animações na abertura, nos cliques e nos terminais

**Branch**: `015-animacoes` | **Date**: 2026-11-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/015-animacoes/spec.md`

## Summary

Dar movimento ao OpenHost sem custo de tempo: tela de abertura com o chevron laranja sobre preto
piano pintada pelo `index.html` antes de qualquer JS (e fundo nativo da janela em `#050505`);
retorno de clique por CSS `:active`/`[data-pressed]` e trava `data-busy` contra clique duplo;
entrada/saída de abas, crescimento do painel ao dividir com um único `fit()` no fim, indicador de
"conectando" no painel; coerência em diálogos, Configurações, paleta, toasts, SFTP e cartões da
Home. Uma preferência local `motion` (Sistema/Completas/Reduzidas/Desligadas) vira
`<html data-motion>` e controla tokens (`--motion-*`, `--motion-shift`) num só lugar. Detalhes em
[research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26 (preferência e cor de fundo da janela); TypeScript 5 `strict` + React 19

**Primary Dependencies**: Wails v2.17 (WebView2/WebKit), Zustand, xterm.js 6 — **nenhuma dependência nova**

**Storage**: `preferences.json` do `appwin` (campo `motion`, só neste computador)

**Testing**: `go test` (normalização da preferência; ausência em `SyncPreferences`), Vitest
(resolução do nível, `fit` único, trava de ação), Playwright e2e (abertura, digitação logo após abrir
aba, zero animação com `off`), `scripts/check-tokens.mjs`

**Target Platform**: Windows 10/11, Linux (WebKitGTK 4.1), macOS 12+

**Project Type**: desktop-app (Go + WebView)

**Performance Goals**: retorno de clique no quadro seguinte; ≤ 20 ms a mais até o campo de senha
aceitar digitação (SC-1501); 60 fps nas transições usando só `transform`/`opacity`/cor

**Constraints**: nenhuma entrada (teclado, foco, ação) espera fim de animação; nada em loop quando
parado (SC-1506); transições ≤ 250 ms (FR-170); só tokens de cor/movimento (check-tokens); CSP sem
script inline

**Scale/Scope**: ~15 módulos CSS, `index.html`, `main.tsx`, `TabBar`, `TerminalView`/registry,
`ui/` (Button, Menu, motion), Configurações › Aparência; Go: `appwin/preferences.go`, `main.go`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação | Notas |
|---|---|---|
| I. Clean Room | ✅ | Animações e chevron próprios da marca (`brand/kit/openhost-mark.svg`); nada copiado |
| II. Segurança | ✅ | Ponte ganha só um campo de preferência sem segredo, validado/normalizado no Go; CSP mantida (sem script inline); indicador de conexão não mostra dados da sessão. Revisão: campo `motion` aceita só 4 valores |
| III. Local-First | ✅ | Preferência fica no computador; não sincroniza (FR-1518) |
| IV. Testes Primeiro | ✅ | Testes Go/Vitest antes da implementação; e2e de digitação e de `off` |
| V. Simplicidade | ✅ | Sem biblioteca de animação; um atributo + tokens; reaproveita `ui/motion.ts` (`leaveGhost`, indicador) |

Re-check após o design: sem violações. Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/015-animacoes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ui-motion.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
main.go                                  # BackgroundColour #050505 (Codex)
internal/appwin/preferences.go(+_test)   # campo Motion, normalização (Codex)
frontend/
├── index.html                           # #boot: SVG do chevron + CSS inline
├── src/main.tsx                         # aplica data-motion; remove #boot ao montar a 1ª tela
├── src/styles/global.css                # [data-motion] tokens, --motion-shift, keyframes
├── src/ui/motion.ts(+test)              # resolveMotion, useMotionLevel, dismissBoot
├── src/ui/useBusyAction.ts(+test)       # trava de ação demorada
├── src/ui/Button.tsx, Menu.tsx, ui.module.css   # pressionado/busy
├── src/features/terminal/               # TabBar (entrar/fechar), TerminalView/registry (fit único),
│                                        # indicador "conectando"
├── src/features/hosts/                  # item pressionado; connect com useBusyAction
├── src/features/settings/               # Aparência › Animações
└── tests/e2e/motion.spec.ts             # novo
```

**Structure Decision**: estrutura atual (Go na raiz/`internal`, React em `frontend/src`). A parte Go
(campo `motion`, cor de fundo) vai como cartão para o Codex; o resto é frontend.

## Complexity Tracking

Sem violações.

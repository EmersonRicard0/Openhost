# Implementation Plan: Ícones e detecção de fabricantes de equipamentos de rede

**Branch**: `005-network-vendors` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-network-vendors/spec.md`

## Summary

Reconhecer o fabricante de equipamentos de rede por mais três fontes além da versão SSH (mensagem
pré-login, trecho inicial do terminal e, como hoje, `/etc/os-release` em servidores genéricos),
tudo em memória, sem enviar nada ao terminal e sem atrasar sua abertura; acrescentar ZTE,
Datacom e Hillstone com ícones próprios na cor da marca. A detecção sai do caminho crítico de
`dialHost` e passa a rodar numa goroutine; o canal extra deixa de ser aberto em hosts já
conhecidos como equipamento de rede. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26 (backend), TypeScript `strict` + React 19 (frontend)

**Primary Dependencies**: `golang.org/x/crypto/ssh` (já usado: `BannerCallback`,
`ServerVersion`), Wails v2.17; nenhuma dependência nova

**Storage**: cofre existente; sem mudança de esquema (campos `detectedOs`/`osIcon` já existem)

**Testing**: `go test` (tabelas de assinaturas, amostras em `testdata`, integração com o
servidor SSH de teste), Vitest e Playwright

**Target Platform**: Windows 10/11, Linux (WebKitGTK 4.1), macOS 12+

**Project Type**: app desktop (Go + webview)

**Performance Goals**: terminal aceita digitação sem espera adicional (< 0,2 s, SC-503);
observador custa O(1) depois da janela

**Constraints**: nenhum byte enviado ao terminal pela detecção; texto examinado só em memória,
≤ 8 KiB por fonte; janela do terminal ≤ 5 s

**Scale/Scope**: 9 fabricantes de rede, ~30 assinaturas; 3 ícones novos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ Ícones de ZTE, Datacom e Hillstone desenhados no projeto, sem copiar os logos oficiais (R6); demais logos seguem do Simple Icons (CC0) já registrado em `docs/licenses.md`. Assinaturas são textos públicos que o equipamento mostra ao usuário. |
| II. Segurança e Segredos | ✅ Revisão de segurança: o texto pré-login e o trecho do terminal podem conter dados do ambiente (nome do equipamento, avisos legais). Eles ficam só na memória da goroutine, limitados a 8 KiB, nunca vão para log, erro, evento ou cofre (R5, FR-508). `BannerCallback` sempre devolve `nil`, sem afetar a autenticação. A detecção não escreve no stdin (FR-509). O canal `exec` extra passa a ser aberto em menos casos (FR-513). |
| III. Local-First | ✅ Tudo local; ícones embutidos. Formato do cofre inalterado, sem migração (R7). |
| IV. Testes Primeiro | ✅ Tabela de assinaturas, normalização e resolução com testes unitários antes do código; amostras reais/simuladas em `testdata`; integração para "não envia ao stdin" e "não espera a detecção"; e2e do seletor. |
| V. Simplicidade | ✅ Sem dependência nova; uma tabela fixa em vez de heurísticas; o observador é um `io.Writer` com limite. |
| Plataformas | ✅ Nada específico de sistema; testes rodam nos três no CI. |

Sem violações; Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/005-network-vendors/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/detection.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
internal/
├── domain/os.go                 # ids zte, datacom, hillstone; IsNetworkOS
├── sshx/
│   ├── dial.go                  # BannerCallback → Client.PreAuthBanner
│   ├── terminal.go              # observador da saída (vendorSniffer) e InitialOutput
│   ├── vendors.go               # tabela de assinaturas, normalização, ClassifyBanner/Terminal
│   ├── osdetect.go              # ResolveOS; ClassifyServerVersion ganha ZTE/Datacom/Hillstone
│   └── testdata/{vendors,servers}/   # amostras
└── bridge/sessions.go           # detecção em goroutine depois do terminal; regra FR-513

frontend/src/
├── shared/model/types.ts        # OS_IDS
├── ui/osIcons.tsx               # rótulos, SVGs próprios, EXTRA_HEX
└── ui/osIcons.test.ts
frontend/tests/e2e/os-icon.spec.ts
docs/licenses.md                 # registro dos ícones próprios e das cores
```

**Structure Decision**: mantém a divisão atual: detecção no pacote `sshx` (puro e testável),
orquestração em `bridge/sessions.go`, ícones no `ui/osIcons.tsx`. Codex implementa o backend
(`internal/`); Claude implementa frontend, ícones e e2e.

## Post-Design Constitution Check

Reavaliado após research, data-model e contrato: nenhum novo risco. O único dado sensível novo
(texto do servidor) tem limite de tamanho, vida curta e nenhuma saída além do id.

## Complexity Tracking

Sem violações a justificar.

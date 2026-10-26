# Implementation Plan: Atualização pelo próprio app, com aviso de versão nova

**Branch**: `007-in-app-update` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-in-app-update/spec.md`

## Summary

O app consulta as releases públicas do GitHub ao abrir e a cada 6 h, avisa sem bloquear quando
há versão mais nova do seu formato de instalação, baixa o pacote em segundo plano, confere uma
assinatura Ed25519 do `SHA256SUMS.txt` com chave embutida e o hash do pacote, e aplica por um
processo auxiliar (o próprio executável com `--apply-update`) que espera o app fechar, instala
(NSIS silencioso, troca do `.app`, troca do AppImage) e reabre. Pacotes `.deb`/`.rpm` recebem
download e comando. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26 (backend), TypeScript `strict` + React 19 (frontend)

**Primary Dependencies**: biblioteca padrão do Go (`net/http`, `crypto/ed25519`,
`crypto/sha256`); Wails v2.17 já usado; nenhuma dependência nova

**Storage**: preferências do app (`appwin.Preferences.updates`, fora do cofre); arquivos
temporários em `<dados>/updates/`

**Testing**: `go test` com `httptest` e chave de teste; Vitest para o store de atualização;
Playwright contra o app real com servidor de releases local (`update.spec.ts`)

**Target Platform**: Windows 10/11 (instalador NSIS), macOS 12+ (`.app` universal via `.dmg`),
Linux (AppImage com 1 clique; `.deb`/`.rpm` manual)

**Project Type**: app desktop (Go + webview)

**Performance Goals**: verificação não atrasa a abertura (roda depois da janela pronta);
download com progresso a cada ≤ 250 ms

**Constraints**: nenhum dado do usuário sai do computador (FR-705); nada instalado sem
assinatura e hash conferidos (FR-710); falha nunca deixa o app sem abrir (FR-713)

**Scale/Scope**: pacote Go novo `internal/updater` (~6 arquivos), serviço na ponte, um subcomando
no `main`, um passo no workflow de release, script de assinatura; frontend: store, aviso,
indicador na barra de status, seção nas Configurações, comando na paleta

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ Fluxo comum de autoatualização; nada copiado. |
| II. Segurança | ✅ Assinatura Ed25519 + SHA-256 antes de executar qualquer pacote; URLs e caminhos nunca vêm do frontend; auxiliar só aceita manifesto em `updates/`; cofre volta bloqueado. Revisão de segurança no contrato ([bridge-updater.md](./contracts/bridge-updater.md#segurança-revisão-obrigatória-princípio-ii)). |
| III. Local-First | ✅ Tudo funciona sem rede; a consulta não envia dado do usuário e pode ser desligada (FR-705, SC-705). Ligada por padrão por decisão do usuário. |
| IV. Testes Primeiro | ✅ `internal/updater` com testes antes (escolha de versão, detecção, assinatura, download); e2e com servidor local; aplicação real validada à mão por sistema. |
| V. Simplicidade | ✅ Sem biblioteca de autoatualização; o auxiliar é o próprio binário. Processo extra justificado em Complexity Tracking. |
| Plataformas | ✅ Detecção e aplicação por build tags (`apply_windows.go`, `apply_darwin.go`, `apply_linux.go`). |

## Project Structure

### Documentation (this feature)

```text
specs/007-in-app-update/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/bridge-updater.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
internal/updater/
├── releases.go / releases_test.go   # consulta, ETag, escolha da versão (R1)
├── install*.go / install_test.go    # detecção do formato por sistema (R3)
├── verify.go / verify_test.go       # Ed25519 + SHA-256 (R2)
├── pubkey.go                        # chave pública embutida
├── download.go / download_test.go   # .part, Range, progresso, espaço (R5)
└── apply_{windows,darwin,linux}.go  # auxiliar --apply-update (R4)
internal/bridge/updates.go           # UpdateService + eventos
internal/appwin/preferences.go       # campo updates
main.go                              # subcomando --apply-update antes do Wails
scripts/sign-sums/                   # gerar chave e assinar SHA256SUMS.txt
.github/workflows/release.yml        # passo de assinatura
frontend/src/
├── stores/updates.ts (+ test)
├── features/updates/UpdateToast.tsx, UpdateSettings.tsx
├── app/StatusBar.tsx                # indicador
├── features/palette/CommandPalette.tsx
└── i18n/pt-BR.ts
frontend/tests/e2e/update.spec.ts
```

**Structure Decision**: backend num pacote próprio, como `forwarding` e `importer`; a ponte só
traduz. Frontend em `features/updates`. Divisão: Codex faz `internal/*`, `main.go` e
`scripts/sign-sums`; Claude faz frontend, workflow, e2e e a validação.

## Post-Design Constitution Check

Reavaliado após research, data-model e contrato: a ponte ganha um serviço com métodos sem
caminhos/URLs vindos do frontend; a única execução de programa externo é o pacote verificado.
Sem novos riscos.

## Complexity Tracking

| Item | Por que é preciso | Alternativa mais simples rejeitada porque |
|---|---|---|
| Processo auxiliar (`--apply-update`) | o executável em uso não pode ser substituído no Windows, e trocar o `.app` aberto é inseguro | aplicar dentro do app: impossível no Windows e arriscado no macOS |
| Assinatura própria com Ed25519 | o HTTPS e o SHA256SUMS sozinhos não protegem contra troca de arquivos na release | só checksum: quem troca o pacote troca a lista |

## Pré-requisitos do dono do projeto

- Gerar o par de chaves (`go run ./scripts/sign-sums -gen`), guardar a privada num cofre pessoal
  e cadastrar como segredo `UPDATE_SIGNING_KEY` no repositório; commitar a pública.
- A primeira versão com o atualizador é instalada à mão.

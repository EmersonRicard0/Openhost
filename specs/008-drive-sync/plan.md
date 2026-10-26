# Implementation Plan: Sincronizar o cofre pelo Google Drive

**Branch**: `008-drive-sync` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-drive-sync/spec.md`

## Summary

O usuário liga uma conta Google pelo navegador do sistema (OAuth de app de desktop com PKCE,
escopo `drive.appdata`). O cofre vai para a pasta oculta do app no Drive como snapshots
imutáveis, selados com a DEK do cofre; um `keyring.json` guarda as DEKs seladas pela senha
mestra, o que permite abrir o cofre num computador novo e invalidar a senha antiga após uma
troca. Mudanças de computadores diferentes são juntadas item a item com vetores de versão;
mudanças concorrentes no mesmo item viram conflito para o usuário escolher. Histórico = os
snapshots retidos. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26 (backend), TypeScript `strict` + React 19 (frontend)

**Primary Dependencies**: `golang.org/x/oauth2` (nova, R1); `net/http`, `compress/gzip`,
`crypto/sha256` da biblioteca padrão; criptografia e KDF já existentes em `internal/vault`;
Drive API v3 por REST, sem SDK

**Storage**: cofre SQLite (migração 1→2: tabela `sync_state` selada, R7); nuvem:
`appDataFolder` com `keyring.json` + `snap-*.ohs` ([cloud-format.md](./contracts/cloud-format.md))

**Testing**: `go test` com Drive falso (`internal/cloudsync/drivefake`) e funções puras de junção;
teste de migração; Vitest para o store; Playwright com o Drive falso e duas pastas de dados

**Target Platform**: Windows 10/11, macOS 12+, Linux (WebKitGTK 4.1) — sem código por sistema
além de abrir o navegador (já existe no Wails)

**Project Type**: app desktop (Go + webview)

**Performance Goals**: mudança local na nuvem em ≤ 10 s; mudança remota aplicada em ≤ 60 s;
5 000 hosts sincronizam (snapshot ≈ 1–2 MB)

**Constraints**: nada legível sai do computador (FR-805, SC-804); app 100% usável sem rede
(SC-806); envio interrompido nunca invalida a nuvem (FR-807)

**Scale/Scope**: pacote novo `internal/cloudsync` (~8 arquivos + fake), migração e
`OnChange`/`Rekey` no `vault`, `SyncService` na ponte, client id na release; frontend: store,
seção Sincronização, indicador, opção na primeira tela, diálogos de juntar, conflito,
histórico, senha nova e desconectar

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ OAuth e Drive pela documentação pública do Google; nada de outro app. |
| II. Segurança | ✅ Só material selado sai (XChaCha20-Poly1305 + Argon2id existentes); senha e DEK não saem do Go; token selado no cofre; loopback só em 127.0.0.1 com PKCE e `state`; conteúdo recebido não confiável e validado. Revisão no contrato ([bridge-sync.md](./contracts/bridge-sync.md#segurança-revisão-obrigatória-princípio-ii)). |
| III. Local-First | ✅ Desligado por padrão: só liga com ação explícita do usuário (opt-in); tudo funciona sem rede e sem conta; migração 1→2 documentada e testada (R7). Sem servidor do projeto: o Drive é do usuário. |
| IV. Testes Primeiro | ✅ Junção (R4), formato (R3), chaveiro (R6), migração e OAuth com testes antes; e2e com Drive falso; conta real validada à mão. |
| V. Simplicidade | ⚠️ "Nuvem" estava fora do MVP; esta spec aprovada é a autorização exigida pelo princípio. Dependência nova (`x/oauth2`) justificada abaixo. |
| Plataformas | ✅ Nenhum arquivo por sistema novo. |

## Project Structure

### Documentation (this feature)

```text
specs/008-drive-sync/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/bridge-sync.md
├── contracts/cloud-format.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
internal/cloudsync/
├── oauth.go / oauth_test.go         # loopback + PKCE + renovação + revogação (R1)
├── drive.go / drive_test.go         # list/get/create/update/delete em appDataFolder (R3)
├── format.go / format_test.go       # keyring + snapshot (cabeçalho, AD, gzip, hash) (R3)
├── merge.go / merge_test.go         # vetores de versão, conflitos, dependências (R4)
├── items.go / items_test.go         # Content + perfis + esquemas + prefs ↔ itens (R8)
├── syncer.go / syncer_test.go       # ciclo, agrupamento 3 s, timer 60 s, retentativa (R5)
├── onboarding.go / _test.go         # nuvem→cofre novo, juntar, substituir, troca de senha (R6)
├── retention.go / _test.go          # 30 versões / 30 dias
└── drivefake/                       # Drive falso para testes Go e e2e (R9)
internal/vault/                      # migração 1→2, SyncState selado, OnChange, Rekey
internal/apperr/                     # códigos novos
internal/bridge/sync.go (+ test)     # SyncService + evento sync:state
internal/bridge/testsvc/             # SetCloudEndpoint (tag e2e)
.github/workflows/release.yml        # ldflags GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
frontend/src/
├── stores/sync.ts (+ test)
├── features/sync/SyncSettings.tsx, ConnectDialog.tsx, StartChoiceDialog.tsx,
│   ConflictDialog.tsx, HistoryDialog.tsx, NewPasswordDialog.tsx, DisconnectDialog.tsx
├── features/vault/CreateVaultScreen.tsx   # "Usar meu cofre do Google Drive"
├── app/StatusBar.tsx                # indicador
└── i18n/pt-BR.ts
frontend/tests/e2e/sync.spec.ts
```

**Structure Decision**: backend num pacote próprio (`cloudsync`), que conversa com o cofre só
pela API do `Store`; a ponte traduz. Divisão: Codex faz `internal/*`; Claude faz frontend,
workflow, e2e e validação.

## Post-Design Constitution Check

Reavaliado após research, data-model e contratos: a superfície nova da ponte não recebe URLs nem
caminhos; o único dado que sai é material selado + metadados não sensíveis (lamport, id
aleatório do computador). A troca de senha com DEK nova fecha o risco da senha antiga. Sem
novos riscos.

## Complexity Tracking

| Item | Por que é preciso | Alternativa mais simples rejeitada porque |
|---|---|---|
| `golang.org/x/oauth2` | troca/renovação de token com casos de erro do Google | escrever à mão: mais código de segurança próprio; SDK do Drive: dependência muito maior |
| Vetores de versão por item | juntar sem perder mudanças e detectar conflito sem relógio (SC-805) | "último ganha" perde mudanças; ancestral comum erra em junções cruzadas |
| DEK por época + chaveiro | senha antiga deixa de valer em todos os computadores (FR-812) | só re-embrulhar a DEK: a senha antiga continuaria abrindo cópias antigas do chaveiro |
| Drive falso | testar sem conta Google e no CI | conta real no CI exige segredo e rede |

## Pré-requisitos do dono do projeto

- Criar projeto no Google Cloud, ativar a Drive API, configurar a tela de consentimento
  (escopos `drive.appdata`, `openid`, `email`; não sensíveis) e criar um cliente OAuth do tipo
  **App para computador**.
- Cadastrar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` como segredos do repositório.
- Para uso público, publicar a tela de consentimento (escopos não sensíveis dispensam a
  verificação completa; o Google ainda pode pedir conferência de marca).

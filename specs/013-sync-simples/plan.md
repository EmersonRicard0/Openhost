# Implementation Plan: Sincronização simples para o usuário final

**Branch**: `013-sync-simples` | **Date**: 2026-10-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-sync-simples/spec.md`

## Summary

A sincronização da 008 ganha um segundo lugar de guarda, a **pasta sincronizada** (Google Drive,
OneDrive ou Dropbox instalados no computador), que vira o caminho principal: um clique, sem conta,
sem navegador. O motor da 008 (formato, cifragem, conflitos, histórico, troca de senha) não muda:
o `Syncer` passa a falar com uma interface `Remote` de cinco operações, implementada pelo `Drive`
atual e por um `Folder` novo que grava os mesmos arquivos numa subpasta `OpenHost`. Em volta disso:
decisão automática ao conectar (`Start("auto")`), recuperação de chave órfã, convite depois de
criar o cofre, ícone de nuvem na barra de status, tela enxuta com "Mais opções", erros em frases
simples, e a publicação do cliente OAuth com página inicial e política de privacidade no GitHub
Pages. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26; TypeScript `strict`, React 19

**Primary Dependencies**: Wails 2.17, Zustand (já usados); nenhuma nova (sem biblioteca de
observação de arquivos: a pasta é lida pelo mesmo ciclo de consulta da 008, R4)

**Storage**: arquivos da 008 (`keyring.json`, `snap-*.ohs`) numa subpasta `OpenHost`; estado da
sincronização em `sync_state` (cofre) com o lugar (`drive` | `folder`) e o caminho da pasta;
convite em `VaultSettings`

**Testing**: `go test` (`cloudsync` com `Folder` em `t.TempDir()`, detecção por sistema com
raízes falsas, `Start("auto")`, chave órfã nos dois lugares, arquivo incompleto); Vitest (texto
dos erros, decisão do convite); Playwright contra o app real (`sync-folder.spec.ts` com duas
pastas de dados e uma pasta comum; `sync.spec.ts`/`sync-devices.spec.ts` seguem verdes)

**Target Platform**: Windows 10/11, Linux (WebKitGTK 4.1), macOS 12+

**Project Type**: app desktop (Go + webview)

**Performance Goals**: mudança gravada na pasta em ≤ 10 s; mudança de outro computador aplicada
em ≤ 1 min (consulta de 1 min da 008); detecção das pastas em < 200 ms ao abrir o convite

**Constraints**: nada fora da subpasta `OpenHost` é lido ou alterado; gravação atômica (arquivo
temporário + renomear) para o programa da pasta nunca levar arquivo pela metade; nada de
conteúdo do cofre nem nome do computador em nomes de arquivo; credenciais OAuth só nos segredos
do repositório e no build

**Scale/Scope**: Go — `cloudsync` (`remote.go`, `folder.go`, `folders*.go` novos; `syncer.go`,
`onboarding.go`, `password.go`, `retention.go`), `bridge/sync.go`, `model.VaultSettings`.
Frontend — `features/sync` (`SyncSettings`, `StartChoiceDialog` → `CloudPasswordDialog`,
`OpenFromCloud`, `SyncInvite` e `SyncStatusIcon` novos), `CreateVaultScreen`, barra de status,
`i18n`. Fora do app — `site/` (página inicial e privacidade), workflow do Pages e publicação do
cliente no Console do Google

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ Sincronizar por pasta de serviço de nuvem é padrão comum; nada copiado. Caminhos das pastas vêm da documentação pública de cada programa (R3). |
| II. Segurança | ✅ Na pasta só vão os mesmos arquivos selados da 008; nomes sem conteúdo. Nenhum token no caminho da pasta. A ponte ganha só `FolderCandidates()`, `ConnectFolder(kind, path)` e `Start("auto")`; caminho escolhido é validado no Go e o app só toca `<pasta>/OpenHost`. E-mail e caminho fora de logs e de "Detalhes". Páginas públicas sem credenciais nem identificadores (R11). **Revisão de segurança**: toca sincronização e ponte → revisar validação de caminho, ausência de segredo em nomes/logs/páginas e varredura do histórico do git. |
| III. Local-First | ✅ Continua opt-in; sem conta para o caminho da pasta. Formato da nuvem igual ao da 008 (versão 1); `sync_state` ganha campos opcionais com padrão `drive` (R5), sem mudança de `SchemaVersion`. |
| IV. Testes Primeiro | ✅ `Folder`, detecção, `auto` e chave órfã com testes antes; regressão da chave órfã achada no teste real da 008. |
| V. Simplicidade | ✅ Uma interface de 5 métodos em vez de duplicar o `Syncer`; sem observador de arquivos; sem servidor próprio (descartado, R1). |
| Plataformas | ✅ Detecção de pastas isolada por build tags com contraparte nos três sistemas; CI nos três. |

Sem violações. Re-check pós-design: os contratos (bridge, folder-format, ui) não acrescentam
dependência, segredo novo nem caminho fora de `OpenHost/`; segue sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/013-sync-simples/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/bridge.md
├── contracts/folder-format.md
├── contracts/ui.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
internal/cloudsync/
├── remote.go            # interface Remote (List, Get, Create, UpdateKeyring, Delete) + RemoteFile
├── drive.go             # Drive implementa Remote (sem mudança de comportamento)
├── folder.go            # Folder: Remote sobre <pasta>/OpenHost, gravação atômica
├── folders.go           # FolderCandidate, ordem Google Drive > OneDrive > Dropbox
├── folders_windows.go   # detecção no Windows
├── folders_darwin.go    # detecção no macOS
├── folders_linux.go     # detecção no Linux (Dropbox)
├── syncer.go            # usa Remote; lugar (drive|folder) no estado
├── onboarding.go        # Start auto; chave órfã = nuvem vazia
└── password.go          # readSingleKeyring sobre Remote
internal/bridge/sync.go  # FolderCandidates, ConnectFolder, Start("auto")
internal/model/model.go  # VaultSettings.SyncInvite

frontend/src/features/sync/
├── SyncInvite.tsx           # convite (depois de criar o cofre e pelo ícone)
├── SyncStatusIcon.tsx       # ícone de nuvem na barra de status
├── CloudPasswordDialog.tsx  # substitui StartChoiceDialog: uma senha, "Mais opções"
├── SyncSettings.tsx         # tela enxuta + "Mais opções"
└── syncErrors.ts            # frase + ação por código; Detalhes recolhido
frontend/src/features/vault/CreateVaultScreen.tsx

site/                        # GitHub Pages: index.html, privacidade.html (nada interno)
.github/workflows/pages.yml
```

**Structure Decision**: o motor continua um só; a diferença entre Drive e pasta fica atrás de
`Remote`. Divisão como nas features anteriores: Go pela fila do Codex, frontend e site pelo
Claude.

## Complexity Tracking

Sem violações a justificar.

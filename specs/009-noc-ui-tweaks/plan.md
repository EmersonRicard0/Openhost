# Implementation Plan: Ajustes de interface para o dia a dia em NOC

**Branch**: `009-noc-ui-tweaks` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-noc-ui-tweaks/spec.md`

## Summary

Seis ajustes de interface para quem mantém muitas sessões em equipamentos de rede: cor do
ambiente na aba e no terminal, Configurações como aba própria, seleção laranja e densidade
compacta na lista, tags e notas no host, porta como campo simples e nome da aba pelo prompt. No
Go, só campos novos em estruturas que já existem: host (`environmentId`, `tags`, `notes`) no JSON
cifrado, lista de ambientes em `VaultSettings`, duas preferências e a exportação OpenHost v2. Sem
mudança de esquema SQL. O resto é frontend. Decisões em [research.md](./research.md).

## Technical Context

**Language/Version**: Go 1.26; TypeScript `strict`, React 19

**Primary Dependencies**: Wails 2.17, xterm.js, Zustand (já usados); nenhuma nova

**Storage**: cofre SQLite cifrado (host e `VaultSettings` são JSON selado, campos novos opcionais);
preferências locais em `appwin.Preferences`

**Testing**: `go test` (domain, vault, exporter, importer, bridge, cloudsync); Vitest
(`promptTitle`, título exibido, store de workspace); Playwright contra o app real
(`noc-ui.spec.ts`)

**Target Platform**: Windows 10/11, Linux (WebKitGTK 4.1), macOS 12+

**Project Type**: app desktop (Go + webview)

**Performance Goals**: busca por tags/nota em 500 hosts acompanhando a digitação; leitura do
prompt no máximo 1×/s por sessão; troca de ambiente refletida em até 1 s

**Constraints**: nenhum terminal remontado ao abrir/fechar as Configurações; borda do ambiente sem
mudar o tamanho em células entre hosts; contraste ≥ 3:1 das cores de ambiente nos temas

**Scale/Scope**: Go — `model`, `domain/hosts`, `vault` (padrões de ambiente), `bridge` (vault, app),
`appwin/preferences`, `cloudsync/items`, `exporter`/`importer` OpenHost. Frontend — `HostForm`,
`HostList`, `Sidebar`, `TabBar`, `Workspace`, `TerminalView`, `PaneHeader`, `SettingsPage`
(Aparência e Terminal), `NumberField`, stores `sessions`, `workspace`, `ui`, `hosts`; módulo novo
`promptTitle.ts`; componentes novos `TagInput` e `EnvironmentsEditor`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Situação |
|---|---|
| I. Clean Room | ✅ Cor por ambiente, tags e densidade são padrões comuns; nada copiado. |
| II. Segurança | ✅ Tags, notas e ambientes ficam no cofre cifrado e só saem dele pela sincronização já consentida (008) e pela exportação cifrada. A ponte ganha só campos validados no Go (tamanho, quantidade, lista fechada de cores). A leitura do prompt é local, não envia nada ao equipamento. **Revisão de segurança**: toca o cofre e a ponte → revisar a validação dos campos novos e que a nota não apareça em logs nem em mensagens de erro. |
| III. Local-First | ✅ Tudo funciona offline; nenhum dado novo sai da máquina sem a sincronização opt-in. Formato do cofre: campos opcionais no JSON selado, compatíveis para leitura (R1); sem mudança de `SchemaVersion`. Formato de exportação versionado (v2, R8). |
| IV. Testes Primeiro | ✅ Validação, padrões de ambiente, ida e volta de exportação e `extractPromptName` com testes antes; e2e cobrindo as seis histórias. |
| V. Simplicidade | ✅ Sem tabela nova, sem dependência nova; Configurações fora do store de sessões para não espalhar um tipo novo de aba (R3). |
| Plataformas | ✅ Nada específico de sistema. |

Sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/009-noc-ui-tweaks/
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
├── model/model.go                 # Host.EnvironmentID/Tags/Notes; Environment; VaultSettings.Environments
├── domain/hosts.go                # HostInput + validação; Duplicate copia
├── vault/                         # padrões de ambiente ao ler settings sem a lista
├── bridge/vault.go, app.go        # chave environments; hostDensity, promptTitle
├── appwin/preferences.go          # HostDensity, PromptTitle
├── cloudsync/items.go             # SyncPreferences.PromptTitle
├── exporter/openhost.go           # Version 2
└── importer/openhost.go           # v1 e v2; ambiente por nome
frontend/src/
├── features/hosts/HostForm.tsx, TagInput.tsx, HostList.tsx
├── features/sidebar/Sidebar.tsx + css     # seleção laranja, densidade, busca por tags/nota
├── features/terminal/TabBar.tsx, Workspace.tsx, TerminalView.tsx, PaneHeader.tsx
├── features/terminal/promptTitle.ts / promptTitle.test.ts
├── features/settings/SettingsPage.tsx, EnvironmentsEditor.tsx, TerminalSettings.tsx
├── theme/environments.ts          # id de cor → valor por tema
├── ui/NumberField.tsx             # steppers={false}
├── stores/sessions.ts, workspace.ts, ui.ts, hosts.ts
└── i18n/pt-BR.ts
frontend/tests/e2e/noc-ui.spec.ts
```

**Structure Decision**: Go para o Codex pela fila (`.agente-queue/`, worktree
`shellvault-codex`, branch `009-codex-backend`), em um card: modelo, validação, padrões,
preferências, sincronização e exportação v2 com testes. Frontend, e2e e revisão com o Claude. As
histórias US2, US3 (seleção), US5 e US6 não dependem do Go e começam antes.

## Post-Design Constitution Check

Reavaliado após research, data-model e contratos: a ponte só ganha campos; a revisão de
segurança fica como tarefa explícita antes do merge. Sem novos riscos.

## Complexity Tracking

Sem violações a justificar.

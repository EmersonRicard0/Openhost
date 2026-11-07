# Implementation Plan: Importar e exportar hosts

**Branch**: `003-host-import-export` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-host-import-export/spec.md`

## Summary

Nova tela "Importar e exportar" que traz hosts, grupos e chaves privadas de `~/.ssh/config`,
PuTTY/KiTTY, CSV, MobaXterm, SecureCRT e do próprio arquivo `.openhost`, sempre com prévia
editável, detecção de duplicados e gravação atômica com desfazer; e exporta para `.openhost`
(cifrado quando leva chaves), formato do OpenSSH e CSV. Todo o parsing, a conversão de `.ppk` e
a gravação ficam no Go (`internal/importer`, `internal/exporter`) atrás de dois serviços novos
da ponte (`ImportService`, `ExportService`); a interface React só exibe a prévia e envia
decisões. Nenhuma tabela nova no cofre. Decisões em [research.md](research.md).

## Technical Context

**Language/Version**: Go 1.26.x (`CGO_ENABLED=0`); TypeScript 6 `strict` no frontend

**Primary Dependencies**: as da 002. Novas no uso direto: `golang.org/x/sys/windows/registry`
(já no módulo), `golang.org/x/text/encoding/charmap` (BSD-3, já indireta → direta). Biblioteca
padrão: `encoding/csv`, `encoding/xml`, `crypto/aes`, `crypto/hmac`. Nenhuma dependência nova
no frontend.

**Storage**: cofre SQLite da 002 sem mudança de esquema; prévia e lote de desfazer só em
memória; arquivos exportados escolhidos pelo usuário

**Testing**: `go test` com fixtures reais por origem em `internal/importer/testdata/`; teste de
ida e volta do `.openhost`; atomicidade com falha injetada; Vitest para o store e a tabela da
prévia; Playwright (`import-export.spec.ts`) contra `tests/fixtures/sshd`; varredura de segredos
ampliada

**Target Platform**: Windows 10/11 x64 (PuTTY/KiTTY só no Windows; demais origens portáveis)

**Project Type**: desktop-app (Wails: backend Go + frontend web embutido)

**Performance Goals**: prévia de 1.000 hosts ≤ 3 s; gravação ≤ 5 s (SC-302); tabela fluida com
1.000+ linhas

**Constraints**: offline; nenhum segredo fora do cofre exceto `.openhost` cifrado pedido pelo
usuário; arquivo de origem ≤ 10 MB e ≤ 5.000 hosts; nunca sobrescrever `~/.ssh/config`; pt-BR

**Scale/Scope**: 6 origens + 3 destinos; 2 serviços novos na ponte; ~5 componentes de interface

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Verificação | Status |
|---|---|---|
| **I. Clean Room** | Parsers próprios a partir da documentação pública dos formatos (`ssh_config(5)`, apêndice PPK do manual do PuTTY, arquivos gerados pelos programas); nenhum código ou texto de interface dos clientes de origem. Dependências BSD-3. | ✅ |
| **II. Segurança** | Leitura de arquivos e registro só no Go; a interface nunca recebe conteúdo de chave (R1, R2); senhas nunca lidas (FR-319); `.openhost` com chaves usa Argon2id + XChaCha20-Poly1305 do próprio cofre com cabeçalho autenticado (R10); exportar chaves exige senha mestra; prévia zerada ao descartar ou bloquear. Revisão de segurança abaixo. | ✅ |
| **III. Local-First** | Tudo local; formato `.openhost` versionado e com regra para versões novas. | ✅ |
| **IV. Testes Primeiro** | Fixtures e testes de tabela antes de cada parser; ida e volta; atomicidade; E2E. | ✅ |
| **V. Simplicidade** | Sem mudança de esquema; reuso de `Store.Mutate`, `domain.ImportKey` e `vault.Seal`; sem biblioteca de tabela virtual; `.xlsx` e outros clientes fora (Assumptions). | ✅ |
| Arquitetura | Processo Go / interface sem privilégio / ponte validada; caminhos só por diálogo nativo do Go. | ✅ |

**Re-check pós-design (Phase 1)**: data-model sem tabelas novas, contrato sem saída de
segredos e quickstart mantêm todas as verificações. Nenhuma violação.

### Revisão de segurança (Princípio II)

Superfícies tocadas: ponte (2 serviços), cofre (gravação em lote), criptografia (arquivo de
exportação), credenciais (importação de chaves e `.ppk`).

| Risco | Mitigação |
|---|---|
| Chave ou passphrase vazar para a interface | `PreviewView` sem conteúdo de chave; teste de contrato serializa toda resposta dos serviços e procura marcadores de chave privada |
| `.openhost` com chaves legível ou adulterável | Argon2id (custo do cofre) + XChaCha20-Poly1305; cabeçalho no AD; teste de adulteração de cada campo |
| Senha mestra exigida mas não verificada | `ExportService` revalida a senha com `unwrap` antes de exportar chaves; teste com senha errada |
| Parser travar ou estourar memória com arquivo hostil | limites de 10 MB / 5.000 hosts / 8 níveis de `Include` / `MaxKeyBytes`; testes com entradas malformadas e ciclo de `Include` |
| PPK com MAC inválido aceito | MAC sempre verificado antes de usar a chave; testes com arquivo alterado |
| Perda do `~/.ssh/config` do usuário | nunca sobrescreve; cópia `.bak` + temporário + rename (R11) |
| Prévia com chaves sobreviver ao bloqueio | `ImportService` assina o estado do cofre e zera a prévia e o lote ao bloquear |
| Segredos em `detail` de erro | erros de parser citam só linha e código; `apperr.Sanitize` continua aplicado |

## Project Structure

### Documentation (this feature)

```text
specs/003-host-import-export/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/bridge.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
internal/
├── importer/
│   ├── preview.go        # ImportPreview, linhas, duplicados (R12), limites
│   ├── commit.go         # Commit/Undo sobre Store.Mutate (R3)
│   ├── openssh.go        # R4
│   ├── putty.go          # R5 (registro injetável; putty_windows.go / putty_other.go)
│   ├── ppk.go            # R6
│   ├── csv.go            # R7 + modelo
│   ├── mobaxterm.go      # R8
│   ├── securecrt.go      # R9
│   ├── openhost.go       # leitura do .openhost (R10)
│   └── testdata/
├── exporter/
│   ├── openhost.go       # R10
│   ├── openssh.go        # R11 (marcadores, .bak, rename)
│   └── csv.go
├── apperr/apperr.go      # códigos novos (data-model)
└── bridge/
    ├── import.go         # ImportService
    ├── export.go         # ExportService
    └── contract_test.go  # lista de métodos atualizada

frontend/src/
├── features/importexport/
│   ├── ImportExportPage.tsx
│   ├── ImportWizard.tsx
│   ├── PreviewTable.tsx
│   ├── KeyPassphraseDialog.tsx
│   ├── ExportDialog.tsx
│   ├── ImportSummary.tsx
│   └── importexport.module.css
├── stores/importExport.ts
├── shared/ipc/api.ts, shared/model/types.ts, bridge/index.ts   # imports/exports
├── features/settings/SettingsPage.tsx                          # seção nova
└── features/hosts/HostSidebar.tsx                              # item de menu

frontend/tests/e2e/import-export.spec.ts
```

**Structure Decision**: segue a divisão da 002 — Go em `internal/<pacote>` com serviço fino em
`internal/bridge`, frontend por feature. Divisão de trabalho: o Go (`internal/importer`,
`internal/exporter`, serviços e erros) vai para o Codex pela fila; a interface, o E2E e o
polimento visual ficam com o Claude.

## Complexity Tracking

Nenhuma violação a justificar.

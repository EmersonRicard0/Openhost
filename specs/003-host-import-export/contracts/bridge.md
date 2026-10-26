# Contrato: ImportService e ExportService (ponte)

**Feature**: `003-host-import-export` | Acrescenta à `specs/002-wails-migration/contracts/bridge.md`

As regras gerais da 002 valem: `Result<T>`, validação no Go, 🔒 exige cofre desbloqueado,
segredos só no sentido interface → Go, e caminhos locais escolhidos só por diálogo nativo
aberto pelo Go. Duas structs novas entram na lista de `Bind` e no teste de reflexão do
contrato: `ImportService` e `ExportService`. Tipos em [data-model.md](../data-model.md).

## ImportService 🔒

| Método | Entrada | Saída | Notas |
|---|---|---|---|
| `Sources()` | — | `{kind, available: boolean, defaultFound: boolean}[]` | `putty`/`kitty` só no Windows; `defaultFound` indica `~/.ssh/config` ou sessões existentes no registro |
| `Preview(kind, options)` | `kind: SourceKind`; `options: {useDefault?: boolean, filePassword?: string, csvMapping?: Record<Field, number\|null>}` | `PreviewView \| null` | sem `useDefault`, abre o diálogo nativo do tipo (arquivo, ou pasta para `kittyPortable`); `null` = usuário cancelou; descarta a prévia anterior; depois de `FILE_PASSWORD_REQUIRED`/`FILE_PASSWORD_WRONG`, a chamada seguinte do mesmo `kind` com `filePassword` reaproveita o arquivo já escolhido, sem abrir o diálogo; erros `IMPORT_TOO_LARGE`, `IMPORT_UNREADABLE`, `IMPORT_FORMAT_NEWER`, `FILE_PASSWORD_REQUIRED`, `FILE_PASSWORD_WRONG` |
| `RemapCsv(previewId, mapping)` | | `PreviewView` | reinterpreta o mesmo arquivo já lido |
| `UpdateRow(previewId, rowId, patch)` | `patch: {label?, address?, port?, username?, selected?, duplicateAction?}` | `PreviewView` | revalida e recalcula duplicados de todas as linhas (corrigir uma pode mudar outra); `selected: true` em linha `invalid` → `INVALID_INPUT` |
| `SelectAll(previewId, selected, groupPath?)` | | `PreviewView` | ignora linhas `invalid` |
| `SetDuplicateAction(previewId, action)` | `"skip"\|"replace"\|"keepBoth"` | `PreviewView` | aplica a todos os duplicados |
| `UnlockKey(previewId, keyRef, passphrase)` | | `PreviewKey` | `KEY_BAD_PASSPHRASE` se errada; passphrase fica no estado Go |
| `SkipKey(previewId, keyRef)` | | `PreviewKey` | linhas com a chave passam a autenticar por senha |
| `Commit(previewId, targetGroupId)` | `targetGroupId: string \| null` | `ImportResult` | um único `Mutate`; chaves `needsPassphrase` restantes são tratadas como `skipped`; descarta a prévia; `PREVIEW_EXPIRED` |
| `Undo(batchId)` | | `{removed, restored, keptEdited}` | `UNDO_UNAVAILABLE` |
| `Discard(previewId)` | | — | idempotente |
| `SaveCsvTemplate()` | — | `boolean` | diálogo de salvar; `false` = cancelado; não exige cofre |

`PreviewView` = `ImportPreview` sem conteúdo de chave (ver data-model).

## ExportService 🔒

| Método | Entrada | Saída | Notas |
|---|---|---|---|
| `Count(scope)` | `scope` | `{hosts, groups, keys}` | para o resumo do diálogo antes de salvar |
| `Export(request)` | `ExportRequest` | `{path: string, hosts: number, keys: number} \| null` | abre o diálogo de salvar com extensão do formato; `null` = cancelado; `includeKeys` sem `masterPassword` correta → `VAULT_BAD_PASSWORD`; `filePassword` fraca → `WEAK_PASSWORD`; destino existente pede confirmação no próprio diálogo do sistema; a interface sempre envia `sshConfigMode` no formato `openssh` (ela não sabe o destino antes do diálogo); o Go só o aplica quando o destino escolhido é o `~/.ssh/config` do usuário |

`path` volta só para exibir "Salvo em …"; não é segredo.

## Eventos

Nenhum evento novo. A interface recarrega hosts e grupos após `Commit` e `Undo`.

## Segredos

- Nenhum método devolve chave privada, passphrase, senha de arquivo ou senha mestra.
- `detail` dos erros nunca inclui conteúdo de arquivo de origem além do número da linha.
- O teste de varredura de segredos (002) passa a cobrir os arquivos exportados sem chaves e o
  diretório de dados depois de uma importação.

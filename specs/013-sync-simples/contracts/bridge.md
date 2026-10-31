# Contrato: mudanças no `SyncService` (sobre specs/008-drive-sync/contracts/bridge-sync.md)

| Método | Entrada | Saída | Notas |
|---|---|---|---|
| `FolderCandidates()` | — | `FolderCandidate[]` | sem rede; ordem Google Drive, OneDrive, Dropbox; vazio se nada encontrado |
| `ConnectFolder(kind, path)` | `kind` ∈ candidatos ou `"custom"`; `path` só com `"custom"` | `{label, cloudHasVault, willMerge}` | prepara como o `Connect`; `custom` exige caminho absoluto, existente, diretório e gravável ⇒ senão `INVALID_INPUT` (`field: "path"`) |
| `Connect()` | — | `{email, cloudHasVault, willMerge}` | igual à 008 + `willMerge`; chave órfã ⇒ `cloudHasVault: false` |
| `Start(mode, cloudPassword)` | `"auto" \| "upload" \| "replace" \| "merge"` | `SyncInfo` | `auto` decide no Go (data-model, CloudState); senha obrigatória só se a nuvem tem cofre |
| `Info()` | — | `SyncInfo` | ganha `place`, `folderLabel` (sem caminho) |

`willMerge` = nuvem com cofre e cofre local não vazio.

## Erros

- Novo `SYNC_FOLDER_UNAVAILABLE`: pasta não existe mais ou não está gravável (estado "Pendente",
  tentado de novo sozinho).
- `CLOUD_CORRUPT` não é mais devolvido por arquivo de `Folder` que ainda está chegando (R6).

## Segurança (revisão obrigatória)

- Nenhum caminho detectado vai ao frontend; `Info` mostra só o nome do programa.
- `custom`: o Go normaliza (`filepath.Clean`, `Abs`), recusa links simbólicos que saiam da pasta
  e grava só em `<path>/OpenHost`.
- Logs e mensagens de erro sem caminho, e-mail, nomes de host ou conteúdo de arquivo.

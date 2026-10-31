# Data Model: Sincronização simples

## SyncPlace (novo, em `sync_state`)

| Campo | Tipo | Regra |
|---|---|---|
| `place` | `"drive" \| "folder"` | ausente ⇒ `drive` (estados da 008) |
| `folderPath` | string | só em `folder`; absoluto, existente, diretório; o app usa `<folderPath>/OpenHost` |
| `folderKind` | `"googleDrive" \| "oneDrive" \| "dropbox" \| "custom"` | só em `folder`; para o texto "pasta do <programa>" |
| `account` | `SyncAccount` | só em `drive` (e-mail + token, como na 008) |

Transições: `off` → (`ConnectFolder` ou `Connect`) → `pending start` → (`Start`) → ligado →
(`Disconnect`) → `off`. Trocar de lugar = desconectar e conectar de novo.

## FolderCandidate (só leitura, não persistido)

| Campo | Tipo |
|---|---|
| `kind` | `"googleDrive" \| "oneDrive" \| "dropbox"` |
| `label` | nome para a tela ("Google Drive", "OneDrive", "Dropbox") |
| `hasVault` | bool — `<pasta>/OpenHost` tem chave **e** snapshot |

O caminho não vai para o frontend nos candidatos detectados (o Go resolve por `kind`); só um
caminho escolhido à mão sai do seletor do sistema para o Go.

## RemoteFile (interno)

`{ID, Name, CreatedTime, Size}`. Em `Folder`: `ID = Name` (validado pelo mesmo padrão de nome),
`CreatedTime` = data de modificação, `Size` = tamanho.

## CloudState ao conectar (interno)

| Estado | Condição | `Start("auto")` |
|---|---|---|
| vazia | sem `keyring.json` ou chave sem nenhum `snap` (órfã) | `upload` (substitui a chave órfã) |
| com cofre | chave + ≥ 1 `snap` | `replace` se o cofre local estiver vazio; senão `merge` |
| mais nova | `format > 1` | `SYNC_FORMAT` |

"Cofre local vazio" = zero hosts, grupos, credenciais e encaminhamentos.

## VaultSettings.syncInvite (novo)

`"pending" | "dismissed"`; ausente = sem convite. Vai com o cofre na sincronização (inofensivo:
quem sincroniza já ligou).

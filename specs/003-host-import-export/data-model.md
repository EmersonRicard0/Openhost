# Data Model: Importar e exportar hosts

**Feature**: `003-host-import-export` | **Date**: 2026-10-25

Nenhuma tabela nova no cofre. Host, Grupo, Credencial, Regra de encaminhamento e Perfil seguem o
data-model da 002 (incluindo `detectedOs`/`osIcon` da T126). As entidades abaixo vivem só em
memória no processo Go, exceto o arquivo de exportação.

## SourceKind

`"openssh" | "putty" | "kitty" | "kittyPortable" | "csv" | "mobaxterm" | "securecrt" | "openhost"`

## ImportPreview (memória, Go; a interface recebe `PreviewView`)

| Campo | Tipo | Regras |
|---|---|---|
| `id` | UUID | uma prévia ativa por vez; descartada em `Commit`, `Discard`, bloqueio do cofre ou 30 min ociosa |
| `kind` | SourceKind | |
| `sourceLabel` | string | nome do arquivo ou "Registro do Windows (PuTTY)"; nunca conteúdo |
| `rows` | `PreviewRow[]` | até 5.000 |
| `groups` | `PreviewGroup[]` | árvore da origem (caminho → nome); vazia para OpenSSH e PuTTY |
| `keys` | `PreviewKey[]` | chaves distintas referenciadas |
| `ignored` | `IgnoredItem[]` | `{name, reason}` — protocolo não SSH, "Default Settings", bloco `Match` |
| `fileWarnings` | `Warning[]` | linhas ilegíveis do arquivo: `{code: "LINE_UNREADABLE", line}` |
| `csv` | `{columns: string[], mapping: Record<Field, number \| null>, needsMapping: boolean} \| null` | só para CSV |

## PreviewRow

| Campo | Tipo | Regras |
|---|---|---|
| `rowId` | string | estável dentro da prévia |
| `label` | string | 1–100 caracteres; vazio → endereço |
| `address` | string | obrigatório; hostname, IPv4 ou IPv6 (colchetes removidos) |
| `port` | int | 1–65535; ausente → 22 |
| `username` | string | pode ser vazio (o app pergunta na conexão, como hoje) |
| `groupPath` | string[] | caminho de grupos na origem |
| `keyRef` | string \| null | aponta para `PreviewKey.ref` |
| `origin` | string | arquivo:linha, nome da sessão ou linha do CSV |
| `warnings` | `Warning[]` | `INVALID_PORT`, `MISSING_ADDRESS`, `KEY_NOT_FOUND`, `KEY_UNSUPPORTED`, `OPTION_IGNORED` (com nome), `LABEL_REPEATED`, `TOKEN_UNSUPPORTED` |
| `state` | `"ok" \| "invalid" \| "duplicate"` | `invalid` quando há `INVALID_PORT` ou `MISSING_ADDRESS` |
| `duplicateOf` | `{hostId?: string, rowId?: string} \| null` | R12 |
| `selected` | bool | padrão: `true` se `ok`; `false` se `invalid` (não pode virar `true`) ou `duplicate` com ação `skip` |
| `duplicateAction` | `"skip" \| "replace" \| "keepBoth"` | padrão `skip`; `replace` só com `duplicateOf.hostId` |
| `extra` | objeto | só `openhost`: `legacyAlgorithms`, `osIcon`, `authMethod`, perfil e regras de encaminhamento |

`Warning` = `{code, name?, line?}` (`name` = opção ou token, ex.: `ProxyJump`).

Transições: a interface altera `label/address/port/username` (`UpdateRow`), `selected` e
`duplicateAction`; o Go revalida e recalcula `state` e `duplicateOf` a cada alteração.

## PreviewKey

| Campo | Tipo | Regras |
|---|---|---|
| `ref` | string | id interno |
| `name` | string | nome do arquivo (ex.: `id_ed25519`); vira o nome da credencial, deduplicado |
| `path` | string | só exibição |
| `status` | `"ready" \| "needsPassphrase" \| "skipped" \| "notFound" \| "unsupported" \| "existing"` | `existing` = mesma impressão digital já no cofre (reaproveitada) |
| `fingerprint` | string \| null | SHA256, após ler/decifrar |
| `usedBy` | int | linhas que a usam |

Conteúdo da chave e passphrase ficam só no estado Go, nunca na `PreviewView`; zerados ao
descartar a prévia.

## ImportBatch (memória, Go; só o último)

| Campo | Tipo |
|---|---|
| `id` | UUID |
| `createdHostIds`, `createdGroupIds`, `createdCredentialIds` | string[] |
| `replaced` | `{before: Host, updatedAt: string}[]` — `updatedAt` após a substituição, para detectar edição posterior |
| `committedAt` | ISO |

Descartado ao bloquear o cofre, ao fechar o app ou numa nova importação.

## ImportResult

`{batchId, created, replaced, skipped, ignored, keysStored, keysReused, askPassword}`
(contagens; `askPassword` = hosts sem chave que vão pedir senha).

## ExportRequest

| Campo | Tipo | Regras |
|---|---|---|
| `format` | `"openhost" \| "openssh" \| "csv"` | |
| `scope` | `{kind: "all"} \| {kind: "group", groupId} \| {kind: "hosts", hostIds: string[]}` | grupo inclui subgrupos |
| `includeKeys` | bool | só `openhost`; exige `masterPassword` e `filePassword` |
| `masterPassword` | string | verificada contra o cofre; nunca guardada |
| `filePassword` | string | mesma política de força da senha mestra (`WEAK_PASSWORD`) |
| `sshConfigMode` | `"newFile" \| "append"` | só `openssh` quando o destino é o `~/.ssh/config` do usuário |

## Arquivo `.openhost` (disco)

Ver research R10. `data`:

```text
data
├── groups[]        {id, name, parentId, sortOrder}
├── hosts[]         {id, label, address, port, username, authMethod, keyId|null, groupId,
│                    legacyAlgorithms, osIcon, profile|null}
├── forwardRules[]  {hostId, label, bindAddress, allowNonLoopback, bindPort, destHost, destPort}
└── keys[]          {id, name, privateKey, passphrase|null}   (só quando encrypted = true)
```

Os ids do arquivo são locais ao arquivo; na importação tudo recebe id novo. Hosts com
`authMethod: "password"` chegam sem credencial (FR-319). `detectedOs` não é exportado (é
redetectado na conexão).

## Erros novos (`ErrorCode`)

| Código | Quando |
|---|---|
| `IMPORT_TOO_LARGE` | arquivo > 10 MB ou > 5.000 hosts |
| `IMPORT_UNREADABLE` | arquivo não é do formato escolhido (nenhuma linha interpretável) |
| `IMPORT_FORMAT_NEWER` | `.openhost` de versão maior |
| `FILE_PASSWORD_REQUIRED` | `.openhost` cifrado sem senha informada |
| `FILE_PASSWORD_WRONG` | senha do arquivo incorreta (falha de autenticação da cifra) |
| `PREVIEW_EXPIRED` | `previewId` inexistente ou descartado |
| `UNDO_UNAVAILABLE` | lote inexistente ou já desfeito |

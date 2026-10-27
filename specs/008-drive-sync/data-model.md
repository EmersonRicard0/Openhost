# Data Model: Sincronizar o cofre pelo Google Drive

## Local (cofre, tabela `sync_state`, uma linha selada — R7)

### SyncState
| Campo | Tipo | Regra |
|---|---|---|
| `account.email` | string | do `id_token`; só exibição |
| `account.refreshToken` | string | nunca sai do Go nem vai a log |
| `account.connectedAt` | RFC 3339 | |
| `deviceId` | string | 16 hex aleatórios, criado na conexão |
| `deviceName` | string | nome do computador (hostname), editável; vai selado no snapshot |
| `epoch` | int | época da chave em uso (R6) |
| `lamport` | int | maior contador visto |
| `base` | string | nome do último snapshot aplicado/enviado |
| `items` | map `kind:id` → `{vv: map[string]int, hash: string, deleted: bool, deletedAt?}` | R4 |
| `conflicts` | lista de `Conflict` | persistem até a escolha |
| `dirty` | bool | há mudança local não enviada |

`kind` ∈ `group`, `host`, `credential`, `knownHost`, `forward`, `settings`, `profile`, `scheme`,
`prefs` (as preferências de R8, um item só).

### Conflict
| Campo | Tipo | Regra |
|---|---|---|
| `key` | `kind:id` | |
| `label` | string | nome legível do item (rótulo do host etc.), calculado na hora; só vai à interface |
| `local` / `remote` | `ItemVersion` | `{vv, deleted, data}`; `data` é o item serializado (fica selado) |
| `detectedAt` | RFC 3339 | |

Para a interface vai só `ConflictView` (R: segurança): `key`, `label`, `kind`, e para cada
lado `{deleted, summary: [{field, value}]}` com segredos trocados por `"••••"`.

## Nuvem (`appDataFolder`) — formato em [contracts/cloud-format.md](./contracts/cloud-format.md)

- **Keyring**: `{format: 1, epoch, kdf: {alg: "argon2id", time, memoryKiB, salt}, sealedKeys}`.
- **Snapshot**: cabeçalho `{format: 1, epoch, lamport, deviceId, contentHash}` + corpo
  `{deviceName, createdAt, items: [{key, vv, deleted, deletedAt?, data?}]}`.

## Estados da sincronização (evento `sync:state`)

```
off ──connect──▶ syncing ──ok──▶ synced ◀──┐
                    │                       │ mudança local (3 s) / timer 60 s
                    ├─sem rede──▶ pending ──┘ (retentativa)
                    ├─conflito──▶ conflict (continua sincronizando os demais itens)
                    ├─401/revogado──▶ error{auth}
                    ├─sem espaço──▶ error{quota}
                    ├─epoch maior──▶ needsPassword
                    ├─formato novo──▶ error{format}   (FR: versão antiga avisa para atualizar)
                    └─nuvem vazia depois de ligada──▶ error{removed}
locked: qualquer estado acima fica parado enquanto o cofre está bloqueado
```

### SyncInfo (para a interface)
`{state, email?, deviceName?, lastSync?, pending: int, conflicts: int, reason?, available: bool}`
— `available=false` em build sem client id.

### CloudVersion (histórico)
`{name, createdAt, deviceName, items: int}` — `deviceName` exige abrir o corpo; a lista abre os
30 mais novos sob demanda.

## Validação

- `deviceName`: 1–64 caracteres, sem controle.
- `RestoreVersion(name)`: `name` precisa estar na última listagem feita pelo Go (não vira caminho
  nem consulta livre).
- Itens recebidos passam pelas mesmas validações de `internal/validate` antes de entrar no cofre;
  item inválido é ignorado e registrado sem conteúdo.

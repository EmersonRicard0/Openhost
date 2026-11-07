# Contrato: formato do cofre na nuvem (versão 1)

Tudo dentro de `appDataFolder` da conta. Nenhum outro espaço do Drive é lido ou escrito.

## `keyring.json` (mutável, um só)

```json
{
  "format": 1,
  "epoch": 3,
  "kdf": { "alg": "argon2id", "time": 3, "memoryKiB": 65536, "salt": "<base64>" },
  "sealedKeys": "<base64>"
}
```

- `sealedKeys` = `Seal(KEK, json({"1": dek1, "2": dek2, "3": dek3}), ad = "keyring:" + epoch)`,
  com `KEK = DeriveKEK(senha, kdf)` e o `Seal` do cofre (XChaCha20-Poly1305).
- Só é regravado ao criar o cofre na nuvem e ao trocar a senha (época + 1).
- `format > 1` ⇒ o app para e mostra "Atualize o OpenHost para usar este cofre".

## `snap-<lamport:012d>-<deviceId>.ohs` (imutável)

```
"OHS1" | uint32 BE tamanho do cabeçalho | cabeçalho JSON | corpo selado
```

- Cabeçalho: `{"format":1,"epoch":3,"lamport":42,"deviceId":"9f…","contentHash":"<sha256 hex do corpo em claro>"}`.
- Corpo selado = `Seal(DEK[epoch], gzip(json(body)), ad = cabeçalho em bytes)`.
- Corpo: `{"deviceName":"…","createdAt":"…","items":[{"key":"host:…","vv":{"9f…":4},"deleted":false,"data":{…}}]}`.
- `appProperties` do arquivo: só `lamport` e `deviceId` (sem conteúdo do cofre).
- Arquivo que não abre, cabeçalho que não confere com o AD ou `contentHash` diferente ⇒
  recusado como corrompido; nada local é tocado (caso de borda).

## Chamadas à Drive API v3

| Uso | Chamada |
|---|---|
| listar | `GET /drive/v3/files?spaces=appDataFolder&q=name contains 'snap-'&orderBy=name desc&pageSize=N&fields=files(id,name,createdTime,size)` |
| ler | `GET /drive/v3/files/{id}?alt=media` |
| criar snapshot | `POST /upload/drive/v3/files?uploadType=multipart` com `parents: ["appDataFolder"]` (resumable acima de 5 MB) |
| chaveiro | `files.list` por `name='keyring.json'`, `files.create` ou `PATCH /upload/drive/v3/files/{id}?uploadType=media` |
| retenção / apagar tudo | `DELETE /drive/v3/files/{id}` |

Base configurável só em builds `e2e` (`TestService.SetCloudEndpoint`).

# Contrato: serviço de sincronização na ponte

Novo serviço `SyncService` (`internal/bridge/sync.go`), exposto como `window.shellvault.sync`.
Todos devolvem o `Result` padrão (`{ok, value}` ou `{ok:false, error}` com códigos de `apperr`).

| Método | Entrada | Saída | Notas |
|---|---|---|---|
| `Info()` | — | `SyncInfo` | sem rede |
| `Connect()` | — | `{email, cloudHasVault: bool}` | abre o navegador e espera o retorno (≤ 5 min); cancelado ⇒ `SYNC_CANCELLED`, nada muda |
| `CancelConnect()` | — | — | fecha o listener |
| `Start(mode, cloudPassword)` | `"upload" \| "replace" \| "merge"`, string | `SyncInfo` | depois de `Connect` com cofre aberto: `upload` (nuvem vazia; senha vazia), `replace` (usa o da nuvem; local vira `vault-backup-<data>.db`), `merge` (junta); `replace`/`merge` conferem `cloudPassword` com o chaveiro |
| `OpenFromCloud(password)` | string | — | primeira tela, sem cofre local: cria o cofre a partir da nuvem; `VAULT_BAD_PASSWORD`, `CLOUD_EMPTY` |
| `SyncNow()` | — | `SyncInfo` | manual; devolve o erro (`NETWORK`, `SYNC_AUTH`, `SYNC_QUOTA`) |
| `Conflicts()` | — | `ConflictView[]` | segredos mascarados |
| `Resolve(key, keep)` | `key`, `"local" \| "remote"` | `SyncInfo` | `key` precisa existir em `conflicts` |
| `Versions()` | — | `CloudVersion[]` | até 30, mais novos primeiro |
| `RestoreVersion(name)` | string | `SyncInfo` | `name` da última listagem; restauração vira snapshot novo |
| `ProvidePassword(password)` | string | `SyncInfo` | estado `needsPassword` (troca em outro computador) |
| `SetDeviceName(name)` | string | — | 1–64 caracteres |
| `Disconnect(deleteCloud)` | bool | — | revoga o token, apaga `sync_state`; `true` apaga todos os arquivos do app no Drive |

## Eventos

- `sync:state` → `SyncInfo` a cada mudança de estado.

## Erros novos em `apperr`

`SYNC_UNAVAILABLE` (build sem client id), `SYNC_CANCELLED`, `SYNC_AUTH`, `SYNC_QUOTA`,
`SYNC_FORMAT`, `CLOUD_EMPTY`, `CLOUD_CORRUPT`; reaproveita `NETWORK`, `VAULT_LOCKED`,
`VAULT_BAD_PASSWORD`.

## Segurança (revisão obrigatória, Princípio II)

- A senha mestra e a DEK nunca saem do Go; para a nuvem vai só material selado (R3, SC-804).
  Teste: snapshot gerado com hosts de rótulo/endereço/usuário/senha conhecidos não contém
  nenhum deles em bytes, nem comprimidos.
- O refresh token fica selado no cofre e nunca vai ao frontend nem a log; o frontend só recebe
  o e-mail.
- O listener de OAuth escuta só em `127.0.0.1`, porta aleatória, aceita um único retorno com
  `state` correto e fecha; PKCE S256 obrigatório.
- Nenhum argumento do frontend vira URL, caminho ou consulta do Drive; `RestoreVersion` só
  aceita nomes da última listagem; base da API só muda em build `e2e`.
- Conteúdo recebido é tratado como não confiável: AD do cabeçalho, hash, validação de cada
  item antes de gravar; falha não altera o cofre local.
- `ConflictView` mascara senhas, passphrases e chaves privadas.
- `Disconnect` revoga no Google e zera o token em memória e no cofre.
- Troca de senha com sync ligado gera DEK nova (R6): a senha antiga não abre o chaveiro atual.
  Snapshots antigos da nuvem continuam abríveis só por quem tem a senha nova (chaveiro guarda
  todas as épocas).

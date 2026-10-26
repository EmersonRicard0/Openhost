# Contrato: serviço de atualização na ponte

Novo serviço `UpdateService` (`internal/bridge/updates.go`), exposto como
`window.shellvault.updates` no frontend (`frontend/src/bridge/index.ts`). Todos devolvem o
`Result` padrão da ponte (`{ok, value}` ou `{ok:false, error}` com códigos de `apperr`).

| Método | Entrada | Saída | Notas |
|---|---|---|---|
| `Info()` | — | `UpdateInfo` | estado atual, sem rede |
| `Check(manual bool)` | — | `UpdateInfo` | `manual=false` respeita `auto` e falha calado; `manual=true` sempre consulta e devolve o erro (`NETWORK`, `RATE_LIMITED`) |
| `Download()` | — | — | começa em segundo plano; erros vão pelo evento |
| `Cancel()` | — | — | cancela download |
| `Remind()` | — | — | `remindAfter = agora + 24 h` |
| `Skip(version)` | string | — | `version` precisa ser a `latest` atual |
| `Prefs()` / `SetPrefs(p)` | `{auto, prerelease}` | prefs | ligar `prerelease` não muda versão instalada |
| `RestartNow()` | — | — | só em `ready`; dispara o auxiliar e fecha o app |
| `ApplyOnQuit()` | — | — | só em `ready` |
| `LastResult()` | — | `{version, status, reason} \| null` | resultado da última aplicação, uma vez |

## Eventos

- `updates:state` → `{state, version?, progress?: {received, total}, reason?}` a cada mudança
  de estado e no máximo a cada 250 ms durante o download.

## Segurança (revisão obrigatória, Princípio II)

- Nenhum argumento vindo do frontend vira URL ou caminho: o serviço só baixa URLs de assets da
  release escolhida no domínio `github.com`/`objects.githubusercontent.com` e grava só em
  `updates/` na pasta de dados.
- O auxiliar `--apply-update` só aceita um manifesto dentro de `updates/` e só executa o pacote
  que passou pela verificação de assinatura e hash (R2), conferida de novo antes de executar.
- Nenhum dado do cofre, host ou uso é enviado; a requisição leva só `User-Agent` e `If-None-Match`.
- Builds com a tag `e2e` aceitam `TestService.SetUpdateSource(url, pubkey)`; builds de release
  não têm esse método.

# Contrato da ponte: mudanças da 010

## SessionService

- `OpenQuick(target: QuickTarget) → OpenSessionResult` — abre sessão SSH sem host salvo.
  Autenticação: agente SSH (se houver) e depois senha pedida pelo evento de prompt existente
  (`AnswerPrompt`), a cada conexão e reconexão. `InvalidInput` com `field` (`address`, `port`,
  `username`) para alvo inválido. Nenhuma senha nos retornos, eventos ou logs.

## HostService

- `HostInput`/`HostView` ganham `favorite: boolean` (omitido no `Update` mantém).

## AppService (preferências locais)

- `getUiSettings()` devolve `recents: RecentEntry[]` (até 20, mais recente primeiro).
- `recordRecent(entry)` — entrada sem `at`; o Go valida, remove a igual anterior, põe no topo com
  `at` = agora, corta em 20 e devolve a lista. `InvalidInput` para entrada inválida.
- `recents` não entra em `SyncPreferences`.

## Exportação OpenHost

- Host exportado leva `favorite` (formato v2 da 009).

# Research: Tela inicial e conexão rápida

## R1. Sessão sem host salvo

- **Decision**: `SessionService.OpenQuick(target)` monta `sshx.Options` em memória com
  `Auth{Method: AuthAsk}` (senha pedida pelo diálogo de prompt existente a cada conexão), mais o
  agente SSH antes da senha quando houver agente disponível, `LegacyAlgorithms` vindo de
  `VaultSettings.LegacyDefault`, tempos e `$TERM` do cofre e o mesmo `storeKnownHosts`. A sessão
  abre com `hostID = nil`; a reconexão reusa as mesmas opções, sem senha, e pede de novo.
- **Rationale**: reaproveita o fluxo de "Perguntar ao conectar" e a verificação de chave; nada vai
  para o cofre além da chave do servidor aceita (como em qualquer conexão).
- **Alternatives considered**: criar um host temporário no cofre e apagar depois (polui a
  sincronização e deixa lixo se o app cair); pedir a senha no frontend antes de conectar (a senha
  passaria pela ponte num argumento e poderia ir para recentes por engano).

## R2. Interpretação do alvo

- **Decision**: módulo puro no frontend `quickTarget.ts` (`parseTarget(text)`) que aceita
  `[user@]host[:port]`, `[user@][v6]:port`, IPv6 sem colchetes (sem porta) e `ssh [-p N]
  [-l user] [user@]host`; o Go valida de novo (`validate`) endereço, porta e usuário.
- **Rationale**: o frontend precisa do resultado para mostrar erro, procurar host salvo igual e
  pedir o usuário quando faltar; o Go não confia nisso.

## R3. Usuário ausente

- **Decision**: o frontend abre um diálogo curto "Usuário para <alvo>" antes de chamar
  `OpenQuick`; o Go exige usuário.
- **Rationale**: o Go não tem como pedir o usuário depois de abrir a conexão SSH (o usuário vai no
  handshake).

## R4. Recentes

- **Decision**: lista local `recents` em `appwin.Preferences` (não entra em `SyncPreferences`), até
  20 entradas `{kind: 'host', hostId}` ou `{kind: 'quick', address, port, username}` com `at`
  (RFC 3339). O frontend registra quando a sessão chega a `connected` com
  `AppService.recordRecent(entry)`; o Go valida, remove a entrada igual anterior, põe no topo e
  corta em 20.
- **Rationale**: a gravação fica com o Go (arquivo de preferências), a regra de ordem também; o
  frontend só filtra (excluídos, favoritos) e mostra 8.
- **Alternatives considered**: `localStorage` do WebView (sai do padrão de preferências do app e
  fica fora do controle do Go); guardar no cofre (sincronizaria e mudaria `updatedAt` do host a
  cada conexão, gerando upload).

## R5. Favorito

- **Decision**: `favorite bool` no `model.Host`/`HostInput`, no JSON selado (como os campos da
  009); omitido no `Update` mantém o valor; vai na exportação OpenHost v2 (o card da 009 já sobe a
  versão) e na sincronização por `model.Content`.
- **Rationale**: favorito é escolha do usuário sobre o host e deve valer em todas as máquinas.

## R6. Tela inicial

- **Decision**: `HomeScreen` substitui o bloco vazio do `Workspace` (`tabs.length === 0`). A barra
  é um `combobox` com `listbox` de sugestões (`filterHosts` da lista lateral, até 6).
  Ctrl+L/⌘L entra no mapa de atalhos como `focusQuickConnect`, ativo só com a tela inicial.
- **Rationale**: um componente, sem rota nova; a busca é a mesma da lateral (tags e nota inclusas).

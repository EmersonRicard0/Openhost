# Research: Importar e exportar hosts

**Feature**: `003-host-import-export` | **Date**: 2026-10-25

Cada item resolve uma decisão técnica do plano. Formato: decisão, justificativa, alternativas.

## R1 — Onde o trabalho acontece

- **Decisão**: todo o parsing, a leitura de arquivos e do registro, a conversão de chaves, a
  detecção de duplicados e a gravação ficam no Go, num pacote novo `internal/importer` (um
  arquivo por origem) e `internal/exporter`. A interface só recebe a prévia já interpretada e
  devolve decisões (marcar, ação de duplicado, correções).
- **Justificativa**: Princípio II (a interface não toca o sistema de arquivos) e FR-331; a
  prévia nunca carrega conteúdo de chave, só um `keyRef`.
- **Alternativas**: parsing no frontend (rejeitado: exigiria enviar arquivos e chaves para a
  interface).

## R2 — Prévia com estado no Go

- **Decisão**: `ImportService.Preview` guarda a prévia em memória no Go com um `previewId`
  (UUID) e devolve só a visão para a interface. Chaves lidas ficam nesse estado, zeradas ao
  descartar (`Discard`, ao confirmar, ao bloquear o cofre ou após 30 min sem uso). Só uma
  prévia ativa por vez; uma nova descarta a anterior.
- **Justificativa**: passphrases e conteúdo de chave nunca voltam à interface; a gravação usa
  exatamente o que foi lido na prévia (sem reler o disco entre prévia e confirmação).
- **Alternativas**: reler os arquivos no `Commit` (rejeitado: arquivo pode mudar entre os
  passos; a prévia deixaria de ser fiel).

## R3 — Gravação atômica e desfazer

- **Decisão**: `Commit` usa um único `vault.Store.Mutate` (já transacional: rascunho + uma
  transação SQLite; falha não altera nada). O lote guarda em memória os ids criados e a cópia
  anterior dos hosts substituídos; `Undo` aplica o inverso em outro `Mutate`, recusando hosts
  cujo `updatedAt` mudou depois da importação (esses ficam como estão e o resumo informa).
- **Justificativa**: FR-308, FR-310 e SC-307 sem mecanismo novo de transação.
- **Alternativas**: snapshot do arquivo SQLite (rejeitado: pesado e desfaria mudanças alheias
  à importação).

## R4 — `~/.ssh/config`

- **Decisão**: parser próprio do subconjunto necessário, seguindo `ssh_config(5)`: palavras-chave
  sem diferenciar maiúsculas, `chave valor` ou `chave=valor`, aspas, comentários; `Host` com
  vários padrões, `*`, `?` e `!`; `Include` relativo a `~/.ssh/`, com curingas, até 8 níveis e
  sem repetir arquivo; primeiro valor obtido vence; `Match` ignorado com aviso (e seu bloco
  inteiro). Tokens `%h`, `%u`, `%d`, `~` em `IdentityFile` são expandidos; outros `%x` geram
  aviso. Opções reconhecidas: `HostName`, `Port`, `User`, `IdentityFile`; `ProxyJump`,
  `ProxyCommand`, `LocalForward`, `RemoteForward`, `DynamicForward`, `ForwardX11` geram aviso
  "não importado".
- **Justificativa**: o subconjunto é pequeno (~300 linhas com testes) e precisa de semântica
  exata de curinga e de "primeiro valor vence" para os padrões; evita dependência.
- **Alternativas**: `github.com/kevinburke/ssh_config` (MIT; rejeitado: `Include` com
  comportamento parcial e API voltada a consultar um host por vez, não a listar todos).

## R5 — PuTTY e KiTTY

- **Decisão**: `golang.org/x/sys/windows/registry` (já dependência) lê
  `HKCU\Software\SimonTatham\PuTTY\Sessions` e `HKCU\Software\9bis.com\KiTTY\Sessions`. Campos:
  `HostName` (pode trazer `user@host`), `PortNumber` (DWORD), `UserName`, `Protocol`
  (`ssh` entra; `telnet`, `serial`, `raw`, `rlogin` são ignorados), `PublicKeyFile` (caminho
  da `.ppk`). Nome da sessão decodificado de `%XX`. KiTTY portátil: pasta `Sessions` com um
  arquivo por sessão no formato `Chave\valor\`. Leitor do registro injetável para testes; em
  plataformas não Windows a origem não aparece.
- **Justificativa**: API já usada no projeto; formato documentado pelo próprio PuTTY.
- **Alternativas**: exportar `.reg` e ler o arquivo (rejeitado: passo manual a mais).

## R6 — Chaves `.ppk`

- **Decisão**: conversor próprio em `internal/importer/ppk.go` a partir da especificação pública
  do formato (apêndice "PPK file format" do manual do PuTTY): versões 2 e 3; tipos `ssh-rsa`,
  `ssh-ed25519`, `ecdsa-sha2-nistp256/384/521`; cifra `none` ou `aes256-cbc`. v2: chave de
  cifra por SHA-1 da passphrase, MAC HMAC-SHA1; v3: Argon2 (id/i/d) com os parâmetros do
  arquivo, MAC HMAC-SHA256. O MAC é sempre verificado (passphrase errada → `KEY_BAD_PASSPHRASE`).
  O resultado vira chave OpenSSH via `ssh.MarshalPrivateKey` e segue o caminho atual de
  `domain.ImportKey` (origem `"imported"`), guardando a passphrase como hoje.
- **Justificativa**: `x/crypto` tem Argon2, AES e HMAC; o formato é documentado; nenhum código
  do PuTTY é copiado (Princípio I). Tamanho limitado por `MaxKeyBytes`.
- **Alternativas**: bibliotecas de terceiros para PPK (rejeitado: pouco mantidas, sem v3 ou com
  licença não verificada); exigir conversão manual no PuTTYgen (rejeitado: atrito alto, FR-320).

## R7 — CSV

- **Decisão**: `encoding/csv` com `LazyQuotes` e `FieldsPerRecord = -1`; separador detectado
  contando `,` `;` e tab fora de aspas nas 5 primeiras linhas; codificação: BOM UTF-8 removido,
  UTF-8 válido usado como está, senão Windows-1252 via `golang.org/x/text/encoding/charmap`
  (passa de indireta a direta, BSD-3). Cabeçalho normalizado (minúsculas, sem acento, sem
  espaço) e casado com sinônimos: `nome|label|rotulo|name`, `endereco|host|hostname|ip|address`,
  `porta|port`, `usuario|user|username|login`, `grupo|group|pasta|folder`,
  `chave|key|identityfile`. Sem `endereco` reconhecido → a prévia volta com
  `needsMapping` e a lista de colunas; a interface chama `Preview` de novo com o mapeamento.
  Limite de 10 MB e 5.000 linhas.
- **Justificativa**: cobre o CSV do Excel pt-BR (`;`, 1252) sem biblioteca extra.
- **Alternativas**: ler `.xlsx` direto (rejeitado nesta feature, ver Assumptions).

## R8 — MobaXterm

- **Decisão**: o `.mxtsessions` e o `MobaXterm.ini` são INI; seções `[Bookmarks]` e
  `[Bookmarks_N]` têm `SubRep=` (caminho da pasta, `\` como separador) e entradas
  `nome=#ícone#tipo%host%porta%usuário%...`. Tipo `0` = SSH; os demais são ignorados com o
  nome do protocolo quando conhecido. A posição do arquivo de chave privada entre os campos
  `%` é confirmada com arquivos gerados pelo próprio MobaXterm (fixtures da tarefa); campo
  ausente ou fora do esperado vira aviso "chave não lida", nunca erro. Senhas salvas
  (`[Passwords]`) nunca são lidas. Codificação: UTF-8 com BOM ou Windows-1252.
- **Justificativa**: formato texto simples; a validação com arquivos reais elimina o risco das
  posições.
- **Alternativas**: nenhuma razoável (não há biblioteca).

## R9 — SecureCRT

- **Decisão**: `encoding/xml` sobre o XML de "Export Settings": árvore de `<key name="...">`
  sob `<key name="Sessions">`; uma chave com `<string name="Protocol Name">` é sessão, as
  demais são pastas. Lidos: `Hostname`, `[SSH2] Port` (dword, decimal), `Username`,
  `Identity Filename V2` (caminho da chave; formato `caminho:...` tratado) e
  `Protocol Name` (`SSH2` entra; `SSH1`, `Telnet`, `Serial`, `RDP` são ignorados). `Password V2`
  nunca é lido.
- **Justificativa**: export oficial do programa, estável e em texto.
- **Alternativas**: ler a pasta `Config\Sessions\*.ini` (fora desta feature, Assumptions).

## R10 — Formato de exportação do OpenHost

- **Decisão**: arquivo `.openhost`, JSON UTF-8. Sem chaves:
  `{"format":"openhost-export","version":1,"exportedAt":...,"app":"0.x","encrypted":false,"data":{...}}`.
  Com chaves: `{"format":"openhost-export","version":1,"encrypted":true,"kdf":{"alg":"argon2id","time":3,"memoryKiB":262144,"salt":"<b64>"},"payload":"<b64>"}`,
  onde `payload` = `vault.Seal(DeriveKEK(senha, kdf), json(data), ad)` (XChaCha20-Poly1305,
  nonce embutido) e `ad` = bytes canônicos do cabeçalho (`format|version|kdf`). `data` =
  grupos, hosts (sem `credentialId` quando não há chave exportada), regras de encaminhamento,
  perfis de terminal por host e, opcionalmente, credenciais de chave (privada, passphrase,
  nome). Versão maior que a suportada → `IMPORT_FORMAT_NEWER`.
- **Justificativa**: reusa as primitivas do cofre (Princípio II, sem cripto nova); cabeçalho
  autenticado impede trocar parâmetros; JSON facilita versões futuras (FR-325).
- **Alternativas**: exportar o arquivo SQLite (rejeitado: amarra o formato ao armazenamento e
  carrega host keys e preferências que não foram pedidas); ZIP com senha (rejeitado: cifra
  fraca ou dependência extra).

## R11 — Exportar para `~/.ssh/config` e CSV

- **Decisão**: OpenSSH: um bloco por host (`Host <apelido>`, `HostName`, `Port` se ≠ 22,
  `User`), com `# OpenHost: <grupo> / <rótulo>` acima; apelido = rótulo com espaços e
  caracteres fora de `[A-Za-z0-9._-]` trocados por `-`, deduplicado com `-2`, `-3`. Ao
  acrescentar a um arquivo existente: trecho entre `# >>> OpenHost` e `# <<< OpenHost`;
  reexportar substitui só esse trecho; antes, cópia `config.bak-AAAAMMDD-HHMMSS`; gravação via
  arquivo temporário na mesma pasta + rename. CSV: UTF-8 com BOM, `;`, cabeçalho igual ao do
  modelo de importação.
- **Justificativa**: FR-327 a FR-329; rename atômico evita `config` truncado.
- **Alternativas**: sobrescrever o arquivo inteiro (rejeitado: destrói a config do usuário).

## R12 — Duplicados

- **Decisão**: chave = `lower(endereço sem colchetes)|porta|usuário`. Calculada no Go contra o
  cofre e entre as linhas da prévia; recalculada quando a interface corrige uma linha
  (`UpdateRow` devolve a linha nova com o estado). Ação padrão `skip`; `replace` só aplica
  campos vindos da origem (FR-307); `keepBoth` cria outro host com o rótulo seguido de
  " (importado)".
- **Justificativa**: regra única para todas as origens; sem ambiguidade nos testes.

## R13 — Interface

- **Decisão**: `frontend/src/features/importexport/` com `ImportExportPage` (seção nova em
  `SettingsPage` e item "Importar e exportar…" no menu da barra lateral de hosts),
  `ImportWizard` (origem → prévia → resumo), `PreviewTable` (linhas com
  `content-visibility: auto` para 1.000+ linhas, seleção por teclado, edição inline),
  `KeyPassphraseDialog`, `ExportDialog` e `ImportSummary` com "Desfazer". Estado em um store
  Zustand próprio (`stores/importExport.ts`). Visual com os tokens existentes (preto piano,
  destaque laranja); avisos sem borda, como os toasts. A lista de hosts recarrega ao
  confirmar e ao desfazer.
- **Justificativa**: segue a estrutura por feature já usada; sem biblioteca de tabela virtual
  (1.000 linhas com `content-visibility` cabem na meta de SC-302).
- **Alternativas**: `react-window` (rejeitado: dependência para um caso que o CSS resolve).

## R14 — Testes

- **Decisão**: Go: testes de tabela por origem com fixtures em `internal/importer/testdata/`
  (configs reais anonimizadas, `.ppk` v2/v3 com e sem passphrase gerados pelo PuTTYgen,
  `.mxtsessions` e XML do SecureCRT gerados pelos programas, CSVs UTF-8/1252/`;`); ida e volta
  do `.openhost` com e sem cifra; atomicidade com falha injetada no `Mutate`; varredura de
  segredos nos arquivos exportados. E2E Playwright: importar `~/.ssh/config` de fixture (via
  `TestService.SetDialogPath`), conectar ao `tests/fixtures/sshd` pela chave importada,
  exportar `.openhost` com chaves e reimportar num cofre novo.
- **Justificativa**: Princípio IV; SC-303 a SC-307 verificáveis automaticamente.

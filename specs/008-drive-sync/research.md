# Research: Sincronizar o cofre pelo Google Drive

## R1. Autorização: OAuth de app de desktop com PKCE e loopback

- **Decision**: fluxo "Installed app" do Google: o Go abre um `net.Listener` em
  `127.0.0.1:0`, gera `state` e `code_verifier` (PKCE S256), abre a URL de autorização no
  navegador do sistema (`runtime.BrowserOpenURL`), recebe o `code` no loopback, troca por
  tokens em `oauth2.googleapis.com/token`. Escopos: `https://www.googleapis.com/auth/drive.appdata`
  e `openid email` (só para mostrar o e-mail; lido do `id_token`, sem chamada extra). O listener
  fecha depois da primeira resposta válida ou em 5 minutos; `state` errado é recusado.
- **Rationale**: é o fluxo que o Google recomenda para apps nativos; a senha do Google nunca
  passa pelo app (FR-801). `drive.appdata` é escopo **não sensível** no Google, sem verificação
  pesada, e só enxerga a pasta oculta do próprio app (FR-802).
- **Client id/secret**: o "segredo" de app de desktop não é confidencial (o Google documenta
  isso); entra por `-ldflags -X` na release a partir dos segredos `GOOGLE_CLIENT_ID` e
  `GOOGLE_CLIENT_SECRET`. Build sem client id mostra a sincronização como indisponível.
- **Dependência**: `golang.org/x/oauth2` (BSD-3, mesmo mantenedor do `x/crypto` já usado) para
  troca e renovação de token. Nada de SDK do Google: as quatro chamadas da Drive API são REST
  simples (R3).
- **Revogação**: ao desconectar, `POST https://oauth2.googleapis.com/revoke` com o refresh
  token, e o token é apagado do cofre (FR-803, FR-816).
- **Alternatives considered**: `google.golang.org/api/drive/v3` (dependência grande para 4
  chamadas); webview interna para login (proibida pelo Google e pior para segurança); escopo
  `drive.file` (arquivos ficariam visíveis e misturados aos do usuário, contra o cenário US1-3).

## R2. Onde guardar o token

- **Decision**: refresh token selado com a DEK numa linha nova `sync_state` do cofre (migração
  1→2, R7). Access token só em memória. Durante "Usar meu cofre do Google Drive" num computador
  sem cofre, o token vive em memória até o cofre ser criado a partir da nuvem.
- **Rationale**: mesma proteção dos segredos de host (Princípio II); nada no keyring do sistema,
  que tem comportamento diferente nos três sistemas. Cofre bloqueado ⇒ sem token ⇒ sem sync,
  que já é o comportamento pedido nos casos de borda.
- **Alternatives considered**: keyring do sistema (dependência por SO e acesso fora do cofre).

## R3. Formato na nuvem: snapshots imutáveis + chaveiro

Arquivos em `appDataFolder` (detalhes em [contracts/cloud-format.md](./contracts/cloud-format.md)):

- `keyring.json`: único arquivo mutável. Parâmetros do Argon2id, sal, `epoch` e a lista de DEKs
  de todas as épocas selada com a KEK da senha mestra.
- `snap-<lamport:012d>-<deviceId>.ohs`: um por envio, nunca alterado. Cabeçalho em claro
  (formato, época da chave, lamport, id do computador, hash do conteúdo) + corpo selado com a
  DEK da época (AD = cabeçalho). O corpo traz todos os itens com seus vetores de versão (R4) e o
  nome do computador.

- **Decision**: cada envio cria um arquivo novo; o mais novo é o de maior `lamport` (empate pelo
  `deviceId`). `lamport = max(visto) + 1`, sem depender de relógio (caso de borda dos relógios).
  Listar usa `files.list` com `spaces=appDataFolder`, `orderBy=name desc`, `pageSize=40`, só
  `id,name,size,createdTime,appProperties`.
- **Rationale**: criar arquivo é atômico no Drive (um upload interrompido não gera arquivo), então
  a nuvem nunca fica pela metade (FR-807); sem sobrescrita não há escrita perdida entre dois
  computadores; o histórico (FR-815) sai de graça.
- **Retenção**: depois de enviar, apaga snapshots além dos 30 mais novos **e** com mais de 30
  dias (mantém o que for maior). Limpeza feita por qualquer computador, idempotente.
- **Tamanho**: corpo é JSON comprimido com gzip antes de selar; 5 000 hosts ≈ 1–2 MB. Upload
  `uploadType=multipart` até 5 MB, `resumable` acima.
- **Alternatives considered**: um arquivo só sobrescrito (Drive não tem `If-Match` confiável em
  `files.update` → escrita perdida); diário de mudanças (muitos arquivos, compactação complexa).

## R4. Juntar mudanças: vetores de versão por item

- **Decision**: cada item (`kind:id`) tem um vetor `{deviceId: contador}` e o hash do conteúdo.
  Uma mudança local (hash diferente do último conhecido) incrementa o contador deste computador.
  Ao receber um snapshot, para cada item:
  - vetores iguais → nada;
  - remoto domina o local → aplica o remoto;
  - local domina → mantém (vai no próximo envio);
  - concorrentes com hash igual → junta os vetores, sem perguntar;
  - concorrentes com hash diferente (inclui edição × exclusão) → **conflito** (FR-811).
  Exclusões são lápides `{deleted: true}` com vetor, mantidas por 180 dias.
- **Rationale**: decide sem conteúdo ancestral nem relógio, cobre FR-810/FR-811 e é testável
  como função pura. A escolha num conflito vira uma nova versão com vetor = junção dos dois + 1
  deste computador, que domina os dois lados nos outros computadores.
- **Itens dependentes**: regra de encaminhamento cujo host foi excluído, host cujo grupo sumiu,
  host cuja credencial sumiu → resolvidos depois da junção: grupo ausente vira "sem grupo",
  credencial ausente vira referência vazia, regra órfã some. Nunca perde senha: credenciais só
  saem por lápide explícita.
- **Alternatives considered**: merge em três vias com ancestral comum (exige baixar o ancestral e
  erra em junções cruzadas); "último que grava ganha" (perde mudanças, contra SC-805).

## R5. Quando sincronizar

- **Decision**: `Store` ganha `OnChange(func())` chamado depois de cada `Mutate`/troca de perfil
  bem-sucedida; o sincronizador agrupa mudanças por 3 s e envia (FR-808: ≤ 10 s). Busca:
  ao desbloquear, ao conectar, a cada 60 s com o app aberto, e ao voltar a rede. Listar com
  `pageSize=1` e comparar o nome do mais novo custa uma chamada por minuto.
- Falha de rede → estado `pending`, nova tentativa com espera crescente (5 s, 15 s, 60 s, 5 min).
  Sem espaço (`403 storageQuotaExceeded`) → `error: quota`. `401` após renovação → `error: auth`
  (FR-817). Tudo local continua funcionando (SC-806).
- Cofre bloqueado: nada entra nem sai; ao desbloquear, puxa e envia.

## R6. Primeiro uso, juntar e trocar de senha

- **Computador novo (FR-813)**: tela inicial → conectar → baixa `keyring.json`; a senha digitada
  deriva a KEK e abre o chaveiro; senha errada ⇒ `VAULT_BAD_PASSWORD` e nada gravado. Certo ⇒
  cria o cofre local com a mesma DEK da época atual e aplica o snapshot mais novo.
- **Sem cofre na conta**: devolve `CLOUD_EMPTY`; a interface oferece criar cofre novo, que já
  nasce ligado (envia chaveiro e primeiro snapshot).
- **Cofre local + nuvem (FR-814)**: o app pergunta. "Usar o da nuvem" copia o banco local para
  `vault-backup-<data>.db` na pasta de dados e substitui. "Juntar" pede a senha da nuvem, lê o
  local (já aberto), recifra tudo com a DEK da nuvem e junta: ids iguais seguem R4 com o local
  como mudança concorrente; itens com ids diferentes mas iguais em conteúdo-chave (host:
  endereço+porta+usuário; credencial: tipo+conteúdo; grupo: nome+pai) não duplicam. O cofre
  passa a usar a senha da nuvem.
- **Troca de senha (FR-812)**: com sync ligado, `ChangePassword` também gera DEK nova (época +1),
  recifra as linhas locais e regrava `keyring.json` com as DEKs de todas as épocas seladas pela
  KEK nova. Outro computador que vê `epoch` maior para de sincronizar e pede a nova senha; a
  antiga não abre mais nada do chaveiro atual.
- **Recifrar local**: `Store.Rekey(newMeta, newDEK)` reescreve todas as linhas numa transação
  (as assinaturas por linha forçam regravação total).

## R7. Migração do esquema 1 → 2

- **Decision**: `CREATE TABLE sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), sealed BLOB NOT
  NULL)` com conta, refresh token, deviceId, lamport, nome do snapshot base, vetores e conflitos
  pendentes, tudo selado com AD `sync_state:1`. Cofre sem a linha = sync desligado. Teste de
  migração com banco da versão 1 (Princípio III).
- **Rationale**: uma linha só, lida e gravada inteira; tamanho cresce com o número de itens
  (≈ 60 bytes por item), aceitável.

## R8. O que não sincroniza (FR-806)

- Vai: `model.Content` inteiro, perfis de terminal, esquemas de cores, e das preferências só
  `shortcuts`, `copyOnSelect`, `rightClickPaste`, `bell`, `boldBright`, `autoReconnect`.
- Fica: janela, tema, destaque, vidro, barra lateral, grupos recolhidos, shell padrão, fonte do
  terminal das preferências, `updates`.
- Shell local de um perfil que não existe em outro sistema aparece como indisponível (já é o
  comportamento do seletor de shell).

## R9. Testes sem Google

- **Decision**: `internal/cloudsync/drivefake` implementa as rotas usadas (`files.list`,
  `files.create` multipart/resumable, `files.get?alt=media`, `files.update` do chaveiro,
  `files.delete`, token e revoke) em `httptest`; serve aos testes Go e, por
  `TestService.SetCloudEndpoint(url)` (tag `e2e`), ao Playwright, com dois diretórios de dados
  simulando dois computadores. O login no e2e é concluído pelo fake sem navegador.

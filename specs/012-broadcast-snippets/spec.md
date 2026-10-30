# Feature Specification: Digitar no grupo inteiro e biblioteca de comandos

**Feature Branch**: `012-broadcast-snippets`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Digitação em todos os painéis do grupo + biblioteca de comandos, para uso em NOC. (1) Transmitir para o grupo: num grupo de terminais (até 4 painéis, spec 006), ligar/desligar um modo em que o que se digita no painel ativo vai para todos os painéis do grupo (ou para os escolhidos); aviso visual forte em cada painel que recebe; aviso extra quando algum painel é de ambiente Produção (spec 009); desliga sozinho ao sair do grupo; colar texto grande pede confirmação. (2) Biblioteca de comandos: comandos salvos com nome, texto e campos a preencher ({interface}, {vlan}), filtrados por tag do host/fabricante; abrir pela paleta (Ctrl+K) e enviar para a sessão ativa ou para o grupo inteiro; guardados no cofre cifrado e sincronizados (spec 008), exportados no OpenHost."

## Contexto

Em NOC é comum rodar o mesmo comando em vários equipamentos ao mesmo tempo (conferir uma VLAN em
quatro OLTs, ver o BGP em dois roteadores de borda) e repetir os mesmos comandos de diagnóstico
todo dia. Hoje o OpenHost já junta até 4 sessões lado a lado (spec 006) e marca cada host com o
ambiente (spec 009), mas:

- Para rodar o mesmo comando em quatro painéis, o usuário digita quatro vezes.
- Os comandos do dia a dia ficam num bloco de notas fora do app, e quem copia de lá às vezes cola
  no equipamento errado ou esquece de trocar a interface.

Esta feature junta duas coisas que se completam: digitar uma vez e mandar para o grupo inteiro, e
uma biblioteca de comandos salvos que pode ir para uma sessão ou para o grupo. Como mandar texto
para vários equipamentos de uma vez aumenta o estrago de um erro, os avisos de segurança fazem
parte do escopo, não são acabamento.

Os requisitos usam a faixa FR-1201 em diante e SC-1201 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Digitar uma vez em todos os painéis do grupo (Priority: P1)

Com um grupo de terminais aberto, o usuário liga "Digitar no grupo" (botão na aba do grupo,
atalho ou paleta). A partir daí, tudo o que ele digita no painel ativo, incluindo Enter, setas,
Ctrl+C e texto colado, chega também aos outros painéis do grupo. Cada painel que recebe mostra
uma faixa de aviso bem visível. O usuário pode tirar um painel da transmissão sem desligar o
modo, e desliga tudo pelo mesmo botão.

**Why this priority**: é o ganho direto do pedido: um comando em quatro equipamentos com uma
digitação só. Funciona sem a biblioteca.

**Independent Test**: abrir 3 sessões num grupo, ligar o modo, digitar `echo teste` + Enter no
painel ativo e conferir a saída nos três; tirar um painel e ver que ele para de receber.

**Acceptance Scenarios**:

1. **Given** um grupo com 3 sessões conectadas, **When** o usuário liga "Digitar no grupo" e
   digita `show version` + Enter no painel ativo, **Then** os três equipamentos recebem o mesmo
   texto e o Enter, na mesma ordem.
2. **Given** o modo ligado, **When** o usuário olha o grupo, **Then** cada painel que recebe tem
   uma faixa de aviso na cor de destaque com o texto "Recebendo do grupo", e o painel ativo mostra
   "Transmitindo para N painéis".
3. **Given** o modo ligado com 3 painéis, **When** o usuário desmarca um painel pelo cabeçalho
   dele, **Then** esse painel perde a faixa, para de receber, e o ativo passa a mostrar "2
   painéis".
4. **Given** o modo ligado, **When** o usuário troca o painel ativo clicando em outro painel do
   grupo, **Then** a transmissão passa a sair do novo painel ativo e continua chegando aos outros
   que estão marcados.
5. **Given** o modo ligado, **When** o usuário separa um painel do grupo, fecha o grupo ou o
   grupo fica com uma sessão só, **Then** o modo desliga sozinho naquele grupo e a sessão
   separada nunca recebe nada depois de sair.
6. **Given** o modo ligado num grupo, **When** o usuário vai para outra aba e volta, **Then** o
   modo continua ligado e as faixas continuam visíveis; nenhuma tecla digitada em outra aba foi
   transmitida.

---

### User Story 2 - Avisos antes de transmitir para produção ou colar texto grande (Priority: P1)

Antes de ligar a transmissão num grupo em que algum painel é de um host do ambiente Produção, o
app pede confirmação mostrando quais painéis são de produção. Enquanto transmite, colar texto com
mais de uma linha (ou muito longo) pede confirmação mostrando quantos painéis vão receber.

**Why this priority**: transmitir multiplica o efeito de um erro; sem esses avisos o modo do US1
é perigoso demais para usar em produção.

**Independent Test**: num grupo com um host de Produção e um de Laboratório, ligar o modo e ver a
confirmação com o nome do host de produção; colar 3 linhas e ver a confirmação com "2 painéis".

**Acceptance Scenarios**:

1. **Given** um grupo em que um painel é de host do ambiente Produção, **When** o usuário liga
   "Digitar no grupo", **Then** aparece uma confirmação que lista os painéis de produção pelo
   rótulo, com "Transmitir mesmo assim" e "Cancelar"; cancelar mantém o modo desligado.
2. **Given** o modo ligado com um painel de produção, **When** o usuário olha esse painel, **Then**
   a faixa de aviso dele diz também "Produção" além de "Recebendo do grupo".
3. **Given** o modo ligado, **When** o usuário cola texto com 2 linhas ou mais, ou com mais de 200
   caracteres, **Then** aparece uma confirmação com o número de painéis que vão receber e as
   primeiras linhas do texto; só depois de confirmar o texto sai para todos.
4. **Given** o modo ligado, **When** o usuário cola uma linha curta, **Then** ela vai direto, sem
   confirmação.
5. **Given** o modo ligado com um painel de produção já confirmado, **When** o ambiente de outro
   painel é trocado para Produção com o modo ligado, **Then** esse painel sai da transmissão e
   o usuário vê um aviso para incluí-lo de novo à mão.

---

### User Story 3 - Salvar comandos e mandar pela paleta (Priority: P1)

O usuário guarda comandos que usa sempre, cada um com um nome e o texto (uma ou mais linhas).
Pela paleta (Ctrl+K), digita parte do nome ou do texto, escolhe o comando e ele vai para a sessão
ativa. Por padrão o comando é só escrito na linha, sem apertar Enter, para o usuário conferir;
cada comando pode ser marcado para já apertar Enter.

**Why this priority**: tira o bloco de notas do caminho e é útil mesmo sem grupos.

**Independent Test**: criar o comando "Versão" com `show version`, abrir a paleta numa sessão,
buscar "vers", escolher e ver `show version` escrito no terminal sem executar.

**Acceptance Scenarios**:

1. **Given** Configurações → Comandos, **When** o usuário cria um comando com nome "Interfaces"
   e texto `display interface brief`, **Then** ele aparece na lista e continua lá depois de
   bloquear e abrir o cofre.
2. **Given** uma sessão ativa e o comando salvo, **When** o usuário abre a paleta, digita "inter"
   e escolhe "Interfaces", **Then** `display interface brief` aparece na linha do terminal, sem
   Enter, e o foco volta ao terminal.
3. **Given** um comando marcado "Executar ao enviar", **When** o usuário o envia, **Then** o texto
   chega seguido de Enter.
4. **Given** um comando com 3 linhas, **When** é enviado, **Then** as linhas chegam na ordem, cada
   uma seguida de Enter, e a última só tem Enter se o comando estiver marcado para executar.
5. **Given** nenhuma sessão de terminal ativa (tela vazia, Configurações ou SFTP), **When** o
   usuário abre a paleta, **Then** os comandos aparecem desativados com a dica "Abra um terminal
   para enviar".
6. **Given** a paleta aberta, **When** o usuário busca sem acentos ou em minúsculas, **Then** a
   busca encontra o comando da mesma forma que a busca de hosts (spec 009).

---

### User Story 4 - Campos a preencher no comando (Priority: P2)

O texto do comando pode ter campos entre chaves, como `display interface {interface}` ou
`vlan {vlan}`. Ao escolher esse comando, um pequeno formulário pede cada campo antes de enviar.
O valor digitado da última vez aparece preenchido.

**Why this priority**: é o que evita esquecer de trocar a interface ao reaproveitar um comando,
mas o US3 já entrega valor sem isso.

**Independent Test**: comando `show vlan {vlan}`, enviar, preencher 100 e ver `show vlan 100` no
terminal.

**Acceptance Scenarios**:

1. **Given** o comando `interface {interface}\n description {desc}`, **When** o usuário o escolhe
   na paleta, **Then** aparece um formulário com os campos "interface" e "desc", na ordem em que
   aparecem, e o mesmo campo repetido no texto é pedido uma vez só.
2. **Given** o formulário, **When** o usuário preenche e confirma com Enter, **Then** o texto
   enviado tem cada `{campo}` trocado pelo valor.
3. **Given** um campo deixado vazio, **When** o usuário tenta enviar, **Then** o envio é recusado
   com "Preencha o campo interface" e nada é enviado.
4. **Given** o comando enviado com `vlan` = 100, **When** o usuário o escolhe de novo na mesma
   abertura do cofre, **Then** o campo vem preenchido com 100.
5. **Given** um valor com quebra de linha colado no campo, **When** o usuário envia, **Then** a
   quebra é recusada com mensagem, para que um campo nunca execute uma linha a mais.

---

### User Story 5 - Comandos por fabricante e envio para o grupo (Priority: P2)

Cada comando pode ter tags (as mesmas do host, spec 009, como `huawei`, `olt`, `mikrotik`). A
paleta mostra primeiro os comandos com alguma tag em comum com o host da sessão ativa, e os sem
tag servem para todos. Com a sessão ativa dentro de um grupo, o usuário escolhe enviar o comando
só para o painel ativo ou para o grupo inteiro.

**Why this priority**: com dezenas de comandos de fabricantes diferentes, a lista sem filtro fica
longa; e mandar o comando ao grupo junta as duas metades da feature.

**Independent Test**: comandos com tag `huawei` e `mikrotik`, sessão de host com tag `huawei`:
a paleta lista o de `huawei` antes; num grupo, "Enviar ao grupo" escreve o comando nos 3 painéis.

**Acceptance Scenarios**:

1. **Given** uma sessão de host com a tag `huawei`, **When** o usuário abre a paleta sem digitar,
   **Then** os comandos com a tag `huawei` aparecem primeiro, os sem tag em seguida, e os de outras
   tags só aparecem ao buscar pelo nome.
2. **Given** a sessão ativa num grupo de 3, **When** o usuário escolhe um comando, **Then** a
   paleta oferece "Enviar ao painel" (padrão, Enter) e "Enviar ao grupo (3)" (Shift+Enter).
3. **Given** "Enviar ao grupo" num grupo com um painel de Produção, **When** o usuário confirma,
   **Then** aparece a mesma confirmação de produção do US2 antes de enviar.
4. **Given** "Enviar ao grupo" num grupo com um painel desconectado, **When** o comando é enviado,
   **Then** os painéis conectados recebem e o usuário vê "1 painel desconectado não recebeu".

---

### User Story 6 - Comandos sincronizados e exportados (Priority: P3)

Os comandos ficam no cofre cifrado, vão junto na sincronização entre computadores (spec 008)
quando ela está ligada, e entram na exportação e importação do formato OpenHost.

**Why this priority**: importante para quem usa dois computadores ou passa a biblioteca para a
equipe, mas a feature é útil num computador só.

**Independent Test**: exportar com comandos, importar num cofre novo e ver os comandos com nome,
texto, tags e "Executar ao enviar" iguais.

**Acceptance Scenarios**:

1. **Given** a sincronização ligada em dois computadores, **When** um comando é criado no
   primeiro, **Then** ele aparece no segundo na próxima sincronização, e editar o mesmo comando
   nos dois segue a regra de conflito da spec 008.
2. **Given** a exportação OpenHost, **When** o usuário exporta, **Then** pode incluir ou não os
   comandos (marcado por padrão), e o arquivo leva nome, texto, tags e "Executar ao enviar".
3. **Given** um arquivo OpenHost com comandos, **When** o usuário importa num cofre que já tem um
   comando de mesmo nome, **Then** a prévia mostra o repetido e oferece pular ou importar como
   cópia, como já acontece com hosts.
4. **Given** um arquivo OpenHost de versão anterior sem comandos, **When** importado, **Then** a
   importação funciona como antes, sem comandos.

---

### Edge Cases

- Painel do grupo é SFTP: não existe (SFTP não entra em grupos, spec 006).
- Painel desconectado ou encerrado com o modo ligado: não recebe, mostra "Desconectado — não
  recebe" na faixa; ao reconectar volta a receber se continuar marcado.
- Atalhos do app (Ctrl+Shift+W, Ctrl+K, troca de aba) não são transmitidos; só o que iria ao
  terminal ativo é replicado.
- Selecionar texto, rolar e buscar no terminal ativo não afetam os outros painéis.
- Tamanhos diferentes de painel: cada equipamento recebe as mesmas teclas; a saída de cada um
  segue seu próprio tamanho de terminal.
- Equipamento lento num painel: os outros não esperam; a ordem das teclas em cada painel é
  sempre a mesma da digitação.
- Grupo com só o painel ativo marcado (todos os outros desmarcados): o modo continua ligado, sem
  faixas nos outros, e o ativo mostra "0 painéis".
- Bloquear o cofre com o modo ligado: as sessões encerram como hoje e o modo some junto.
- Comando com chave sem par, como `{interface` ou `{}`: o texto fica como está, sem campo; só
  `{nome}` com letras, números, `-` ou `_` vira campo.
- Comando com `{{` e `}}`: viram `{` e `}` literais, para comandos que usam chaves de verdade.
- Comando de nome repetido na mesma biblioteca: recusado na criação, sem diferenciar maiúsculas.
- Comando muito longo ou com caracteres de controle: recusado ao salvar com mensagem.
- Versão antiga do app abrindo um cofre com comandos: os comandos são mantidos sem aparecer, como
  as tags e notas na spec 009.
- Sincronização com um computador de versão antiga: os comandos não se perdem quando o computador
  antigo envia mudanças em hosts.

## Requirements *(mandatory)*

### Functional Requirements

**Digitar no grupo**

- **FR-1201**: Usuários MUST poder ligar e desligar "Digitar no grupo" para o grupo da sessão
  ativa por um botão na aba do grupo, por um atalho configurável (como os da spec 002) e pela
  paleta. Fora de um grupo, o comando não aparece ou aparece desativado.
- **FR-1202**: Com o modo ligado, toda entrada que iria ao terminal do painel ativo (teclas,
  combinações enviadas ao shell e texto colado) MUST ser enviada também a cada outro painel
  marcado do grupo, na mesma ordem e sem esperar a resposta de um para mandar ao outro.
- **FR-1203**: Ao ligar, todos os painéis do grupo MUST começar marcados. Cada painel MUST ter no
  cabeçalho um controle para sair e voltar à transmissão sem desligar o modo.
- **FR-1204**: Cada painel que recebe MUST mostrar uma faixa de aviso fixa, na cor de destaque da
  marca, com "Recebendo do grupo"; o painel ativo MUST mostrar "Transmitindo para N painéis". A
  aba do grupo MUST mostrar um indicador do modo ligado, com nome acessível.
- **FR-1205**: O modo MUST desligar sozinho quando o grupo deixar de existir (fechado ou com uma
  sessão só) e MUST tirar da transmissão, sem desligá-la, a sessão que sair do grupo. Uma sessão
  fora do grupo MUST nunca receber texto transmitido.
- **FR-1206**: O modo MUST valer por grupo, continuar ligado ao trocar de aba e voltar, e MUST NOT
  ser lembrado depois de fechar o app ou bloquear o cofre.
- **FR-1207**: Painéis desconectados, encerrados ou ainda conectando MUST NOT receber e MUST
  mostrar o motivo na faixa; ao ficarem conectados de novo voltam a receber se continuarem
  marcados.

**Avisos**

- **FR-1208**: Ao ligar o modo num grupo com algum painel de host do ambiente Produção, o app MUST
  pedir confirmação listando esses painéis pelo rótulo; cancelar mantém o modo desligado. A faixa
  dos painéis de produção MUST dizer também "Produção".
- **FR-1209**: Se um painel passar a ser de Produção com o modo já ligado, ele MUST sair da
  transmissão e o usuário MUST ver um aviso para incluí-lo de novo à mão.
- **FR-1210**: Com o modo ligado, colar texto com 2 linhas ou mais, ou com mais de 200
  caracteres, MUST pedir confirmação com o número de painéis que vão receber e até as 5 primeiras
  linhas do texto. Cancelar não envia nada a nenhum painel, nem ao ativo.

**Biblioteca de comandos**

- **FR-1211**: Usuários MUST poder criar, editar, duplicar e apagar comandos em Configurações →
  Comandos. Cada comando tem nome (1–64 caracteres, único sem diferenciar maiúsculas), texto
  (1–4.000 caracteres, uma ou mais linhas, sem caracteres de controle além da quebra de linha),
  tags (mesmas regras das tags de host, spec 009) e "Executar ao enviar" (desligado por padrão).
  A biblioteca aceita até 500 comandos.
- **FR-1212**: A paleta MUST listar os comandos e buscar por nome e texto sem diferenciar
  maiúsculas nem acentos. Escolher um comando MUST enviá-lo à sessão de terminal ativa e devolver
  o foco ao terminal.
- **FR-1213**: Enviar um comando MUST escrever o texto como se o usuário o tivesse digitado. Entre
  linhas vai Enter; depois da última só vai Enter se "Executar ao enviar" estiver ligado.
- **FR-1214**: Sem sessão de terminal ativa, os comandos MUST aparecer desativados na paleta com a
  dica "Abra um terminal para enviar".

**Campos a preencher**

- **FR-1215**: Trechos `{nome}` no texto (nome com letras, números, `-` ou `_`, até 32
  caracteres) MUST virar campos; `{{` e `}}` MUST virar chaves literais; qualquer outra chave fica
  como está. Um comando tem no máximo 10 campos diferentes.
- **FR-1216**: Antes de enviar um comando com campos, o app MUST pedir cada campo uma vez, na
  ordem em que aparece, recusar campo vazio ou com quebra de linha com mensagem, e trocar cada
  `{nome}` pelo valor.
- **FR-1217**: O último valor de cada campo MUST vir preenchido na próxima vez que o mesmo comando
  for escolhido, só enquanto o cofre estiver aberto; os valores MUST NOT ser gravados em disco.

**Filtro e envio ao grupo**

- **FR-1218**: Sem texto de busca, a paleta MUST mostrar primeiro os comandos com alguma tag em
  comum com o host da sessão ativa, depois os sem tag; os de outras tags só aparecem ao buscar.
- **FR-1219**: Com a sessão ativa num grupo, a paleta MUST oferecer "Enviar ao painel" (padrão) e
  "Enviar ao grupo (N)". Enviar ao grupo MUST seguir a confirmação de produção do FR-1208 e
  informar quantos painéis não receberam por estarem desconectados.

**Guarda, sincronização e exportação**

- **FR-1220**: Os comandos MUST ficar no cofre cifrado, como os hosts, e o texto deles MUST NOT
  aparecer em logs, mensagens de erro ou telemetria.
- **FR-1221**: Com a sincronização ligada (spec 008), os comandos MUST ir e voltar entre
  computadores com a mesma regra de conflito por item que os hosts.
- **FR-1222**: A exportação OpenHost MUST poder incluir os comandos (incluídos por padrão) com
  nome, texto, tags e "Executar ao enviar"; a importação MUST ler arquivos com e sem comandos, e
  tratar comando de nome repetido como a importação já trata host repetido (pular ou importar como
  cópia).
- **FR-1223**: Abrir o cofre ou sincronizar com uma versão do app que não conhece comandos MUST
  NOT apagar os comandos existentes.

### Key Entities

- **Comando salvo**: nome, texto (uma ou mais linhas, com campos `{nome}`), tags, "Executar ao
  enviar", datas de criação e alteração. Fica no cofre; entra na sincronização e na exportação.
- **Campo do comando**: nome tirado do texto; o último valor usado só existe enquanto o cofre está
  aberto.
- **Transmissão do grupo**: estado por grupo (ligado/desligado) e o conjunto de painéis marcados.
  Só existe na memória; não é gravado nem sincronizado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1201**: Num grupo de 4 sessões, um comando digitado uma vez chega aos 4 equipamentos em
  100% das tentativas de um teste com 50 comandos, sem tecla perdida, repetida ou fora de ordem.
- **SC-1202**: Com o modo ligado, o tempo entre apertar uma tecla e ela aparecer nos outros
  painéis fica abaixo de 50 ms a mais que no painel ativo, em conexão local de teste.
- **SC-1203**: Em 100% dos testes, nenhum texto transmitido chega a uma sessão fora do grupo, a
  um painel desmarcado ou a um painel de Produção sem a confirmação.
- **SC-1204**: Um usuário acostumado ao app encontra e envia um comando salvo pela paleta em menos
  de 5 segundos, contando da abertura da paleta.
- **SC-1205**: Com 500 comandos salvos, a busca da paleta mostra o resultado enquanto se digita,
  sem atraso perceptível (menos de 100 ms por tecla).
- **SC-1206**: Exportar e importar uma biblioteca de 100 comandos preserva 100% dos nomes, textos,
  tags e "Executar ao enviar".

## Assumptions

- "Ambiente Produção" é o ambiente que vem pronto com esse papel na spec 009 (id `prod`), mesmo
  que o usuário mude o nome ou a cor dele; ambientes criados pelo usuário não disparam o aviso
  nesta versão.
- O limite de 200 caracteres e 2 linhas para pedir confirmação ao colar segue o costume de
  outros terminais; pode ser ajustado no plano se os testes mostrarem incômodo.
- Comandos não têm campos automáticos (como o endereço do host); fica para uma próxima versão.
- A biblioteca é do cofre (um usuário); compartilhar com a equipe é pela exportação OpenHost.
- O envio usa o mesmo caminho da digitação normal; equipamentos que perdem caracteres colados
  rápido demais já se comportam assim hoje e não são tratados de forma especial nesta feature.
- Snippets estavam fora do MVP (spec 002, "Fase 2 e 3"); esta spec é a aprovação para tratá-los.
- Depende das specs 006 (grupos), 008 (sincronização) e 009 (ambientes e tags) já entregues.

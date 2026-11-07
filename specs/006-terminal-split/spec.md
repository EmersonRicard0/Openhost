# Feature Specification: Grupos de terminais na mesma janela (tela dividida)

**Feature Branch**: `006-terminal-split`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Grupos de terminais na mesma janela (tela dividida) no OpenHost. Hoje cada sessão (SSH, local ou SFTP) ocupa uma aba inteira. O usuário quer juntar até 4 sessões numa mesma aba: arrastar uma aba (pela barra de abas) para dentro da área do terminal de outra sessão e escolher onde ela entra — esquerda, direita, em cima ou embaixo — com uma prévia visual da zona de soltura antes de soltar; cada painel tem divisória arrastável para ajustar o tamanho; no máximo 4 sessões por grupo. Também deve dar para tirar uma sessão do grupo (voltar a ser aba própria), fechar um painel, mover o foco entre painéis pelo teclado e pelo clique, e o painel ativo fica destacado. Cada terminal recalcula linhas e colunas ao redimensionar. Grupo é montado na hora (não precisa salvar layouts nesta versão). Pergunta em aberto já decidida pelo usuário: arrastar a sessão para dentro de outra, escolher o lado, até 4 por janela, ajustar o tamanho de cada."

## Contexto

Quem administra rede costuma acompanhar vários equipamentos ao mesmo tempo: o roteador de
borda e o de núcleo durante uma manobra, o firewall e o servidor durante um teste, o log de um
lado e o comando do outro. Hoje cada sessão ocupa uma aba inteira, e o usuário alterna entre
abas sem ver as duas ao mesmo tempo.

Esta feature permite juntar até quatro sessões numa mesma aba, lado a lado ou empilhadas,
arrastando uma aba para dentro de outra e escolhendo o lado. Cada painel tem tamanho ajustável.

Decisões do usuário: montar o grupo arrastando uma sessão para dentro de outra; escolher o lado
(esquerda, direita, em cima, embaixo); até 4 sessões por janela; ajustar o tamanho de cada uma.
Layouts salvos ficam para depois.

Os requisitos usam a faixa FR-601 em diante e SC-601 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Juntar duas sessões arrastando uma aba (Priority: P1)

Um analista tem duas abas abertas: `core-sp-01` e `borda-rj`. Ele arrasta a aba `borda-rj` para
cima da área do terminal de `core-sp-01`. Enquanto arrasta, a metade direita do terminal fica
destacada, mostrando onde a sessão vai entrar. Ele solta, e as duas sessões passam a ocupar a
mesma aba, lado a lado, cada uma com seu terminal funcionando.

**Why this priority**: é o núcleo do pedido; sem juntar sessões, nada mais da feature existe.

**Independent Test**: abrir duas sessões, arrastar a aba de uma sobre o terminal da outra,
soltar em cada um dos quatro lados (refazendo entre os testes) e conferir a posição e que os
dois terminais aceitam digitação.

**Acceptance Scenarios**:

1. **Given** duas abas de terminal abertas, **When** o usuário arrasta uma aba sobre o terminal
   da outra, **Then** aparece uma prévia da zona de soltura (metade esquerda, direita, de cima
   ou de baixo, conforme o ponteiro se aproxima de cada borda).
2. **Given** a prévia na metade direita, **When** o usuário solta, **Then** as duas sessões
   ficam na mesma aba, a arrastada à direita, e a aba arrastada some da barra de abas.
3. **Given** o mesmo arrasto, **When** o usuário solta em cima, embaixo ou à esquerda, **Then**
   a sessão entra no lado escolhido.
4. **Given** o arrasto em andamento, **When** o usuário solta fora do terminal ou aperta Esc,
   **Then** nada muda.
5. **Given** sessões juntadas, **When** o usuário olha os terminais, **Then** nenhuma sessão
   reconectou nem perdeu o conteúdo; cada terminal mostra o que já mostrava, ajustado ao novo
   tamanho.
6. **Given** um grupo com 2 ou 3 sessões, **When** o usuário arrasta outra aba sobre um dos
   painéis, **Then** a nova sessão divide aquele painel no lado escolhido, até o limite de 4.

---

### User Story 2 - Trabalhar no grupo: foco, tamanho e destaque (Priority: P1)

Com quatro sessões no grupo, o analista clica num painel para digitar nele, ajusta a divisória
para dar mais espaço ao log e usa o teclado para pular entre painéis sem tirar a mão do teclado.

**Why this priority**: sem foco claro e tamanho ajustável, o grupo não é usável no dia a dia.

**Independent Test**: com quatro sessões num grupo, alternar o foco por clique e por atalho,
arrastar cada divisória e conferir o painel destacado, a digitação no painel certo e o tamanho
do terminal (linhas e colunas) depois de cada ajuste.

**Acceptance Scenarios**:

1. **Given** um grupo, **When** o usuário clica num painel, **Then** ele passa a ser o painel
   ativo, recebe o teclado e fica destacado; os demais ficam visivelmente secundários.
2. **Given** um grupo, **When** o usuário usa o atalho de mover o foco para a esquerda, direita,
   cima ou baixo, **Then** o foco vai para o painel vizinho naquela direção.
3. **Given** uma divisória entre painéis, **When** o usuário a arrasta, **Then** os painéis dos
   dois lados mudam de tamanho em tempo real, e cada terminal recalcula linhas e colunas.
4. **Given** uma divisória, **When** o usuário dá dois cliques nela, **Then** os painéis dos dois
   lados voltam a ter o mesmo tamanho.
5. **Given** um painel ativo, **When** o usuário usa busca no terminal, copiar, colar, limpar ou
   enviar combinação de teclas, **Then** a ação vale só para o painel ativo.
6. **Given** a janela redimensionada, **When** o tamanho muda, **Then** os painéis mantêm as
   proporções e todos os terminais recalculam o tamanho.

---

### User Story 3 - Desfazer o grupo e fechar painéis (Priority: P2)

O analista terminou a manobra. Ele separa uma das sessões de volta para uma aba própria e fecha
outra que não precisa mais. Quando sobra uma sessão só, a aba volta a ser uma aba comum.

**Why this priority**: completa o ciclo de vida do grupo; sem isso, o usuário fica preso ao
layout ou precisa fechar sessões que ainda quer usar.

**Independent Test**: num grupo de três, separar um painel (vira aba própria, mesma sessão),
fechar outro (sessão encerra com a confirmação de sempre) e conferir que a aba restante volta a
ser uma aba comum.

**Acceptance Scenarios**:

1. **Given** um painel num grupo, **When** o usuário escolhe "Separar em nova aba" (no menu do
   painel ou arrastando o cabeçalho do painel para a barra de abas), **Then** a sessão vira uma
   aba própria, sem reconectar, e o espaço dela é distribuído aos vizinhos.
2. **Given** um painel num grupo, **When** o usuário fecha o painel, **Then** a sessão é
   encerrada com a mesma confirmação que fechar uma aba pede hoje, e o espaço vai aos vizinhos.
3. **Given** um grupo com duas sessões, **When** uma delas sai (separada, fechada ou encerrada),
   **Then** a outra ocupa a aba inteira e a aba volta a ser comum.
4. **Given** a aba de um grupo, **When** o usuário fecha a aba, **Then** todas as sessões do
   grupo são encerradas, com uma única confirmação que diz quantas sessões estão ativas.
5. **Given** uma sessão do grupo que cai (desconectada) ou termina, **When** isso acontece,
   **Then** o painel continua no grupo mostrando o estado e a opção de reconectar, como uma aba
   comum.

---

### User Story 4 - Reorganizar dentro do grupo (Priority: P3)

O analista quer trocar a posição de dois painéis do grupo sem desfazer tudo. Ele arrasta o
cabeçalho de um painel para a borda de outro painel do mesmo grupo e solta.

**Why this priority**: conveniência; dá para chegar ao mesmo resultado separando e juntando de
novo.

**Independent Test**: num grupo de três, arrastar o cabeçalho de um painel para a borda de
outro, conferir a nova posição e que nenhuma sessão reconectou.

**Acceptance Scenarios**:

1. **Given** um grupo, **When** o usuário arrasta o cabeçalho de um painel para a borda de outro
   painel do mesmo grupo, **Then** aparece a mesma prévia de zona de soltura, e ao soltar o
   painel muda de lugar.

---

### Edge Cases

- **Limite de 4**: arrastar uma quinta sessão sobre um grupo cheio não mostra zona de soltura e
  exibe uma dica "Máximo de 4 sessões por grupo"; nada muda ao soltar.
- **Arrastar um grupo inteiro sobre outra aba**: não é permitido nesta versão; só sessões
  avulsas entram num grupo (a dica explica).
- **Espaço insuficiente**: se o painel de destino ficaria menor que o mínimo utilizável (cerca de
  20 colunas por 5 linhas por painel), aquele lado não aceita a soltura e a dica explica.
- **Divisória arrastada até o limite**: nenhum painel fica menor que o mínimo; a divisória para.
- **Sessão SFTP**: não entra em grupo nesta versão; arrastar uma aba SFTP não mostra zona de
  soltura, e arrastar uma sessão sobre uma aba SFTP também não.
- **Arrastar a aba sobre ela mesma**: sem efeito.
- **Barra lateral recolhida ou expandida, configurações abertas**: o grupo mantém o layout e os
  terminais recalculam o tamanho ao voltar.
- **Cofre bloqueado**: as sessões continuam como hoje; o grupo não muda.
- **Atalhos do app com o grupo ativo** (nova aba, fechar aba, próxima aba): "fechar aba" fecha
  o painel ativo quando o grupo tem mais de uma sessão; "próxima aba" pula para a próxima aba
  da barra, não para o próximo painel.
- **Leitores de tela**: cada painel tem nome (o título da sessão) e o painel ativo é anunciado.
- **Reiniciar o app**: como as sessões, os grupos não são restaurados (fora de escopo).

## Requirements *(mandatory)*

### Functional Requirements

**Montar o grupo**

- **FR-601**: O usuário MUST poder juntar sessões de terminal (SSH e locais) numa mesma aba
  arrastando a aba de uma sessão sobre a área do terminal de outra.
- **FR-602**: Durante o arrasto, o app MUST mostrar uma prévia da zona de soltura sobre o painel
  de destino — metade esquerda, direita, de cima ou de baixo — conforme a borda mais próxima do
  ponteiro; soltar fora de uma zona ou apertar Esc MUST cancelar sem mudanças.
- **FR-603**: Ao soltar, a sessão arrastada MUST entrar no lado escolhido, dividindo o painel de
  destino ao meio, e sua aba MUST sair da barra de abas.
- **FR-604**: Um grupo MUST ter no máximo 4 sessões. Soltar em grupo cheio, soltar um grupo
  inteiro, envolver uma sessão SFTP ou deixar um painel abaixo do tamanho mínimo MUST ser
  recusado com uma dica que diz o motivo.
- **FR-605**: Juntar, reorganizar ou separar sessões MUST NOT reconectar nem limpar nenhum
  terminal; o conteúdo e o histórico de rolagem continuam.

**Usar o grupo**

- **FR-606**: Exatamente um painel do grupo MUST ser o ativo: ele recebe o teclado, fica
  destacado (borda na cor de destaque) e é o alvo de busca, copiar, colar, limpar e enviar
  combinação de teclas.
- **FR-607**: O usuário MUST poder trocar o painel ativo clicando nele ou com atalhos de teclado
  para as quatro direções, configuráveis como os demais atalhos do app, que não colidam com
  combinações comuns de terminal.
- **FR-608**: Entre painéis vizinhos MUST haver divisória arrastável que muda os tamanhos em
  tempo real, respeitando o mínimo de cada painel; dois cliques na divisória MUST igualar os dois
  lados.
- **FR-609**: Sempre que um painel muda de tamanho (divisória, janela, barra lateral, entrada ou
  saída de painel), o terminal dele MUST recalcular linhas e colunas e avisar a sessão do novo
  tamanho.
- **FR-610**: Cada painel MUST ter um cabeçalho compacto com o ícone e o título da sessão, o
  indicador de estado (como na aba) e as ações "Separar em nova aba" e "Fechar".
- **FR-611**: A aba de um grupo na barra de abas MUST mostrar o título do painel ativo e a
  quantidade de sessões do grupo, e o indicador de estado MUST refletir o pior estado entre as
  sessões (ex.: uma desconectada deixa o indicador de desconectado).

**Desfazer**

- **FR-612**: O usuário MUST poder separar um painel em nova aba (pelo cabeçalho ou arrastando o
  cabeçalho para a barra de abas), sem reconectar.
- **FR-613**: Fechar um painel MUST encerrar só aquela sessão, com a confirmação que fechar uma
  aba já pede; fechar a aba do grupo MUST encerrar todas, com uma confirmação única que informa
  quantas estão ativas.
- **FR-614**: Quando sobrar uma sessão, o grupo MUST se desfazer e a aba voltar a ser comum.
- **FR-615**: O usuário MUST poder reorganizar painéis do mesmo grupo arrastando o cabeçalho de
  um painel para a borda de outro, com a mesma prévia de FR-602.

### Key Entities

- **Grupo**: uma aba que contém de 2 a 4 sessões de terminal dispostas em divisões horizontais e
  verticais, com o painel ativo e a proporção de cada divisão. Existe só enquanto o app está
  aberto.
- **Painel**: o lugar de uma sessão dentro do grupo; tem o título, o estado e o tamanho da
  sessão que mostra.
- **Sessão**: como hoje (SSH ou local); passa a poder estar numa aba própria ou num painel de
  grupo, sem mudar a conexão.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-601**: Um usuário que nunca usou a função junta duas sessões lado a lado em menos de 10
  segundos, só arrastando a aba.
- **SC-602**: Em 100% das operações de juntar, reorganizar e separar, nenhuma sessão reconecta e
  nenhum terminal perde conteúdo.
- **SC-603**: Ao arrastar uma divisória, os terminais acompanham o movimento sem atraso
  perceptível, e ao soltar o tamanho final (linhas e colunas) de cada terminal corresponde ao
  espaço do painel.
- **SC-604**: Com quatro sessões no grupo, o usuário alterna o foco entre todos os painéis só pelo
  teclado, e o painel que recebe a digitação é sempre o destacado.
- **SC-605**: Nenhuma combinação de soltura proibida (quinta sessão, grupo sobre grupo, SFTP,
  espaço insuficiente) altera o layout; cada uma mostra o motivo.

## Assumptions

- Só sessões de terminal (SSH e locais) entram em grupos nesta versão; SFTP fica de fora porque
  sua tela precisa de largura própria.
- Grupos e tamanhos não são salvos entre aberturas do app (layouts salvos ficam para depois).
- Digitar em todas as sessões do grupo ao mesmo tempo (transmissão) não faz parte desta feature.
- O tamanho mínimo de um painel é cerca de 20 colunas por 5 linhas do terminal; o valor exato
  fica para o plano.
- A feature sai numa versão posterior à 0.4.0, independente da 005.

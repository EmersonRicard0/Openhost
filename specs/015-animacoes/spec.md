# Feature Specification: Animações na abertura, nos cliques e nos terminais

**Feature Branch**: `015-animacoes`

**Created**: 2026-11-07

**Status**: Draft

**Input**: User description: "Animações na interface do OpenHost. O usuário quer animações na abertura da ferramenta (entrada do app até a tela de senha/lista de hosts), nos cliques (resposta visual ao clicar em botões, hosts, abas e itens de menu) e na abertura de terminais (nova aba, novo painel ao dividir, conexão SSH começando), \"entre outros\" (fechar aba, trocar de aba, abrir/fechar diálogos e Configurações, toasts). Já existe uma base de movimento (FR-170 da specs/002: transições de no máximo 250 ms com as curvas da marca, tokens --motion-*/--ease-*, desligadas com \"reduzir movimento\" do sistema; indicador deslizante em listas e abas). Restrições: as animações não podem deixar o app mais lento nem atrasar a hora em que dá para usar (digitar a senha, clicar num host, digitar no terminal); entrada no terminal nunca espera animação; respeitar \"reduzir movimento\"; marca preto piano com laranja do chevron como destaque (nada de roxo/azul). Em paralelo o usuário quer otimizar abertura e cliques do app atual (isso continua na feature 014-desempenho, não nesta)."

## Contexto

O OpenHost já tem movimento em menus, diálogos, toasts, troca de seção, recolhimento da barra
lateral e no indicador que desliza até o item selecionado (FR-170, specs/002), sempre em até
250 ms com as curvas da marca e sem animação quando o sistema pede "reduzir movimento". Faltam
três momentos que o usuário sente como "secos":

- **Abertura**: a janela aparece já com a tela de senha (ou a lista de hosts) pronta, sem nenhuma
  entrada; enquanto a interface carrega, a janela fica vazia.
- **Cliques**: botões, hosts, abas e itens de menu mudam de estado sem resposta visual imediata ao
  apertar; com o app ocupado, não dá para saber se o clique foi recebido.
- **Terminais**: uma aba nova, um painel novo ao dividir e uma conexão SSH começando aparecem de
  uma vez; fechar uma aba faz as outras pularem de lugar.

O app precisa continuar rápido: a feature 014 mede e reduz o tempo de abertura e de resposta, e
esta feature não pode piorar esses números. Os requisitos usam a faixa FR-1501 em diante e
SC-1501 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Abertura com a marca, sem esperar mais (Priority: P1)

Ao abrir o OpenHost, a janela mostra imediatamente o fundo preto piano com o símbolo da marca (o
chevron laranja do prompt), que faz uma entrada curta enquanto a interface carrega. Quando a tela
de senha (ou a lista de hosts, se o cofre já estiver aberto) fica pronta, ela entra no lugar do
símbolo com uma transição suave, e o campo de senha já recebe o foco.

**Why this priority**: a abertura é a primeira impressão e hoje mostra uma janela vazia por alguns
instantes. Preencher esse tempo com a marca deixa o app com cara de pronto sem custar tempo.

**Independent Test**: abrir o app 10 vezes medindo o tempo até dar para digitar a senha, com e sem
a animação; ver a marca na janela desde o primeiro quadro e a troca para a tela de senha.

**Acceptance Scenarios**:

1. **Given** o app fechado, **When** o usuário abre o OpenHost, **Then** a janela mostra o fundo
   da marca e o símbolo desde o primeiro instante, sem área branca nem vazia.
2. **Given** a tela de senha pronta antes de a entrada do símbolo terminar, **When** ela fica
   pronta, **Then** a tela de senha aparece na hora (a entrada do símbolo é interrompida) e o
   campo aceita digitação imediatamente.
3. **Given** a interface demora mais que a entrada do símbolo, **When** a entrada termina, **Then**
   o símbolo fica parado (ou com um pulso discreto de "carregando") até a tela ficar pronta, sem
   repetir a entrada.
4. **Given** "reduzir movimento" ligado no sistema, **When** o app abre, **Then** o símbolo
   aparece parado e a tela de senha surge sem transição.

---

### User Story 2 - Resposta imediata ao clicar (Priority: P1)

Ao apertar um botão, um host da lista, uma aba ou um item de menu, o elemento responde no mesmo
instante (um leve afundar ou realce no momento do clique) e volta ao soltar. Ações que demoram
(conectar, salvar, sincronizar) mostram que começaram no próprio botão ou item, sem travar o
resto da interface.

**Why this priority**: é a resposta que o usuário sente a cada clique do dia; sem ela, um clique
num app ocupado parece perdido e o usuário clica de novo.

**Independent Test**: clicar em botões, hosts, abas e itens de menu e conferir o retorno visual no
quadro seguinte ao clique, inclusive com o app processando outra coisa.

**Acceptance Scenarios**:

1. **Given** qualquer botão, host, aba ou item de menu, **When** o usuário aperta o botão do
   mouse, **Then** o elemento mostra o estado de "pressionado" antes de soltar, e volta ao normal
   ao soltar ou ao arrastar para fora.
2. **Given** uma ação que leva mais de um instante (ex.: conectar num host), **When** o usuário
   clica, **Then** o item ou botão mostra que a ação começou e não aceita o mesmo clique duplicado
   até ela terminar ou falhar.
3. **Given** navegação só por teclado, **When** o usuário ativa um elemento com Enter ou espaço,
   **Then** o mesmo retorno visual aparece.
4. **Given** "reduzir movimento" ligado, **When** o usuário clica, **Then** o retorno vira só uma
   mudança de cor, sem movimento.

---

### User Story 3 - Terminais que entram e saem sem pular (Priority: P2)

Uma aba nova entra na barra de abas com uma transição curta; um painel novo ao dividir cresce a
partir da divisão; uma sessão SSH conectando mostra o progresso com um indicador da marca até o
primeiro texto do servidor; ao fechar uma aba, as vizinhas deslizam para o lugar em vez de pular.
A troca de aba é instantânea para o conteúdo do terminal, com o indicador de aba ativa deslizando.

**Why this priority**: é onde o usuário passa o dia; deixa claro o que acabou de abrir, fechar ou
mudar, principalmente com muitas abas. Vem depois da abertura e dos cliques porque o terminal já é
funcional e qualquer atraso aqui é mais caro.

**Independent Test**: abrir, dividir, conectar e fechar abas e painéis, digitando no terminal novo
assim que a aba aparece, e conferir que nada do que foi digitado se perde nem espera a animação.

**Acceptance Scenarios**:

1. **Given** a barra de abas, **When** o usuário abre uma aba nova (atalho, menu ou clique num
   host), **Then** a aba entra com uma transição curta e o terminal já aceita digitação desde o
   primeiro quadro em que aparece.
2. **Given** um terminal, **When** o usuário divide o painel, **Then** o painel novo cresce a
   partir da divisão e os dois terminais ajustam o tamanho uma única vez no fim, sem tremer.
3. **Given** uma conexão SSH começando, **When** ela ainda não recebeu nada do servidor, **Then**
   o painel mostra um indicador de conexão da marca, que some quando chega o primeiro texto ou
   quando aparece um pedido (chave do servidor, senha) ou um erro.
4. **Given** várias abas abertas, **When** o usuário fecha uma do meio, **Then** a aba fechada
   encolhe e as da direita deslizam para o lugar.
5. **Given** o usuário trocando de aba rapidamente (Ctrl+Tab repetido), **When** troca, **Then** o
   conteúdo da aba nova aparece na hora e as transições em andamento são substituídas, sem fila.

---

### User Story 4 - Diálogos, Configurações e avisos coerentes (Priority: P3)

Diálogos, a aba de Configurações, a paleta de comandos, os toasts e o aviso de atualização usam o
mesmo padrão de entrada e saída, com a mesma duração e curva, e as partes que hoje aparecem sem
movimento (por exemplo, a lista de hosts carregando, cartões da tela inicial, a abertura do SFTP)
passam a seguir esse padrão.

**Why this priority**: boa parte já existe pela FR-170; esta história fecha as lacunas e evita
que cada tela anime de um jeito.

**Independent Test**: abrir e fechar cada diálogo, a aba de Configurações, a paleta, o SFTP e
disparar um toast, conferindo duração e curva iguais e a saída animada.

**Acceptance Scenarios**:

1. **Given** qualquer diálogo, a paleta ou a aba de Configurações, **When** abre e fecha, **Then**
   entra e sai com o mesmo padrão e o foco vai para o lugar certo já no início da entrada.
2. **Given** a lista de hosts ou os cartões da tela inicial carregando, **When** os itens chegam,
   **Then** entram em sequência curta (no máximo os primeiros itens visíveis), sem atrasar os que
   já podem ser clicados.

---

### User Story 5 - Escolher o quanto de animação (Priority: P3)

Em Configurações → Aparência, o usuário escolhe entre animações **Completas**, **Reduzidas** (só
mudanças de cor e opacidade, sem deslocamento) ou **Desligadas**. O padrão segue o sistema:
Completas, ou Reduzidas quando o sistema pede "reduzir movimento".

**Why this priority**: quem passa o dia no NOC pode preferir menos movimento, independente da
configuração do sistema; também facilita comparar velocidade com e sem animação.

**Independent Test**: trocar a opção e conferir na hora o efeito na abertura de abas, nos cliques
e nos diálogos, e que a escolha continua depois de reiniciar.

**Acceptance Scenarios**:

1. **Given** a opção em "Desligadas", **When** o usuário abre abas, clica e abre diálogos,
   **Then** nada se move nem esmaece; o retorno de clique vira só uma troca de cor.
2. **Given** uma escolha feita, **When** o app reinicia, **Then** a escolha é mantida neste
   computador.

---

### Edge Cases

- Interface lenta (computador fraco, primeira abertura depois de instalar): a animação da abertura
  nunca fica em loop visível de entrada; o símbolo para e espera, e a tela de senha entra assim que
  pronta.
- Muitas ações seguidas (fechar várias abas com o atalho, abrir 20 abas de uma vez): as transições
  não se acumulam em fila; cada nova ação substitui a anterior e o estado final é o mesmo que sem
  animação.
- Saída contínua no terminal durante uma transição de aba ou painel: a saída não é atrasada nem
  perdida, e o terminal só recalcula o tamanho no fim da transição.
- Janela em segundo plano ou minimizada: animações não rodam enquanto ninguém vê, e o estado
  final é aplicado ao voltar.
- Painel de Produção (ambiente da 009): a cor do ambiente aparece desde o primeiro quadro da aba
  nova, nunca depois da animação.
- Acesso remoto/RDP ou máquina virtual sem aceleração: as animações podem ficar mais pesadas; o
  modo Reduzidas resolve sem perder função.
- Erro de conexão durante o indicador de conectando: o indicador para na hora e a mensagem de erro
  aparece sem esperar a animação terminar.

## Requirements *(mandatory)*

### Functional Requirements

**Princípio geral**

- **FR-1501**: As animações MUST NOT atrasar o momento em que o usuário pode agir: o campo de senha,
  os cliques em hosts e abas e a digitação no terminal MUST funcionar desde o primeiro quadro em
  que o elemento aparece, com a animação ainda em andamento.
- **FR-1502**: Toda entrada de teclado no terminal MUST ser entregue à sessão sem esperar
  animação, e a saída da sessão MUST continuar sendo mostrada durante as transições.
- **FR-1503**: As animações MUST usar a duração e as curvas de movimento da marca da FR-170 (até
  250 ms), com exceção da entrada do símbolo na abertura (FR-1505), e as cores da marca (preto
  piano, laranja do chevron como destaque, neutros); nada de roxo ou azul.
- **FR-1504**: Transições interrompidas por uma nova ação MUST ser substituídas pela nova, sem
  fila; o estado final MUST ser o mesmo que sem animação.

**Abertura (US1)**

- **FR-1505**: Ao abrir, a janela MUST mostrar o fundo da marca e o símbolo do chevron desde o
  primeiro quadro, com uma entrada do símbolo de no máximo 600 ms.
- **FR-1506**: Quando a primeira tela (senha, criação de cofre ou lista de hosts) fica pronta, ela
  MUST substituir o símbolo na hora, mesmo no meio da entrada, com uma transição de até 250 ms, e o
  foco MUST ir para o primeiro campo.
- **FR-1507**: Se a primeira tela demorar mais que a entrada, o símbolo MUST ficar parado ou com um
  pulso discreto, sem repetir a entrada.

**Cliques (US2)**

- **FR-1508**: Botões, itens da lista de hosts, abas, itens de menu e da paleta MUST mostrar um
  estado de pressionado ao apertar (mouse, toque ou Enter/espaço) e voltar ao normal ao soltar ou
  ao sair do elemento.
- **FR-1509**: Ações demoradas iniciadas por clique (conectar, salvar, sincronizar, importar,
  exportar, verificar atualização) MUST mostrar no próprio elemento que começaram e MUST ignorar o
  mesmo clique repetido até terminarem ou falharem.

**Terminais e abas (US3)**

- **FR-1510**: Uma aba nova MUST entrar na barra com transição curta; fechar uma aba MUST encolher
  a aba fechada e deslizar as vizinhas para o lugar.
- **FR-1511**: Ao dividir, o painel novo MUST crescer a partir da divisão, e os terminais
  envolvidos MUST recalcular colunas e linhas uma única vez, ao fim da transição.
- **FR-1512**: Uma sessão SSH conectando MUST mostrar um indicador de conexão da marca até chegar
  o primeiro texto do servidor, um pedido (chave do servidor, senha, keyboard-interactive) ou um
  erro, e o indicador MUST sumir na hora nesses três casos.
- **FR-1513**: Trocar de aba MUST mostrar o conteúdo da aba nova imediatamente; só o indicador de
  aba ativa desliza.
- **FR-1514**: A cor do ambiente (specs/009) MUST estar presente desde o primeiro quadro da aba e
  do painel.

**Coerência (US4)**

- **FR-1515**: Diálogos, a aba de Configurações, a paleta, os toasts, o aviso de atualização, o
  painel de SFTP e os cartões da tela inicial MUST seguir o mesmo padrão de entrada e saída.
- **FR-1516**: Listas que carregam (hosts, tela inicial) MUST animar a entrada só dos primeiros
  itens visíveis, em sequência total de no máximo 250 ms, sem impedir clique nos itens.

**Preferência (US5)**

- **FR-1517**: Configurações → Aparência MUST oferecer Animações **Completas**, **Reduzidas** (só
  cor e opacidade) e **Desligadas**; o padrão MUST seguir "reduzir movimento" do sistema
  (Reduzidas quando ligado, Completas quando não).
- **FR-1518**: A escolha MUST valer na hora e ficar salva neste computador (não entra na
  sincronização do cofre).
- **FR-1519**: Com animações Desligadas, nada MUST se mover nem esmaecer; o retorno de clique
  (FR-1508) MUST continuar como troca de cor.

**Desempenho**

- **FR-1520**: Animações MUST NOT rodar com a janela minimizada ou fora de vista, e MUST NOT manter
  trabalho contínuo quando não há nada animando.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1501**: O tempo da abertura até o campo de senha aceitar digitação não aumenta mais que
  20 ms em relação ao mesmo build sem animações (média de 10 aberturas).
- **SC-1502**: A janela não mostra nenhum quadro branco ou vazio na abertura (conferido em
  gravação de tela de 10 aberturas).
- **SC-1503**: O retorno visual de um clique aparece no quadro seguinte ao clique (até ~16 ms) em
  100% dos elementos da FR-1508, inclusive com uma sessão gerando saída contínua.
- **SC-1504**: Em 20 aberturas de aba seguidas de digitação imediata, 100% dos caracteres
  digitados chegam ao terminal, na ordem.
- **SC-1505**: Dividir um painel recalcula o tamanho do terminal uma única vez por divisão.
- **SC-1506**: Com a janela minimizada e nenhuma animação em andamento, o uso de CPU da interface
  fica igual ao de antes desta feature (dentro da margem de ruído da 014).
- **SC-1507**: Com "Desligadas" ou "reduzir movimento", 0 propriedades de posição ou escala
  animadas na interface (conferido nos testes de interface).

## Assumptions

- O símbolo da abertura é o chevron do prompt em laranja `#FD7B17` sobre o fundo da marca, já
  definido no kit de marca (`brand/`); não há logotipo novo nesta feature.
- A entrada do símbolo pode passar dos 250 ms da FR-170 (até 600 ms) porque ocupa um tempo em que
  a interface ainda está carregando; ela nunca é esperada.
- "Reduzir movimento" do sistema continua valendo como padrão; a preferência nova só permite
  escolher diferente neste computador.
- Sons, vibração e animações dentro do texto do terminal (cursor, rolagem) estão fora do escopo.
- A otimização de abertura e de cliques segue na feature 014; esta feature usa as medições dela
  para provar que não piorou.
- Os testes de interface atuais (e2e) servem para conferir que nada espera animação; as medições
  de tempo usam o mesmo método da 014.

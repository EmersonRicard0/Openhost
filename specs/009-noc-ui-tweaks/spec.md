# Feature Specification: Ajustes de interface para o dia a dia em NOC

**Feature Branch**: `009-noc-ui-tweaks`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Ajustes de interface do OpenHost para quem trabalha em NOC (bloco 1 da revisão de UX): (1) Configurações abrem como aba própria, com ícone e fechável, e deixam de aparecer dentro da área de abas com a aba SFTP/terminal ainda marcada como ativa; (2) host selecionado na lista lateral com barra lateral laranja da marca (preto piano + laranja do chevron), e opção de densidade compacta (uma linha por host); (3) cor por ambiente/cliente no host (ex.: produção em vermelho) aplicada na aba e na borda do terminal, para evitar comando no equipamento errado; (4) campos de tags e notas no editor de host (o modelo já tem notes, o formulário não mostra); (5) campo de porta como número simples, sem os botões − e +; (6) renomear a aba pelo prompt detectado do equipamento (ex.: <BNG.PINDORETAMA>), com opção para desligar."

## Contexto

Quem trabalha em NOC mantém muitas sessões abertas ao mesmo tempo, em equipamentos de clientes e
ambientes diferentes, e o erro mais caro é digitar um comando no equipamento errado. Uma revisão
da interface apontou ajustes pequenos que reduzem esse risco e deixam o app mais fácil de usar com
uma lista grande de hosts:

- As Configurações hoje se sobrepõem à área das abas, mas a aba que estava ativa (terminal ou
  SFTP) continua marcada, e não fica claro onde se está.
- O host selecionado na lista lateral tem só um cinza um pouco mais claro; o laranja da marca
  quase não aparece no app. Com mais de 100 hosts, cada um ocupa espaço demais.
- Nada na aba ou no terminal diferencia um equipamento de produção de um de laboratório.
- Não há onde guardar "VLAN 100, cliente X" no host. Na correção do pedido original: o host
  **não** tem campo de notas hoje; tags e notas são dados novos.
- O campo de porta tem botões − e + que não ajudam a trocar 22 por 2222.
- A aba mostra o rótulo do host, mesmo quando o equipamento informa o próprio nome no prompt.

Os requisitos usam a faixa FR-901 em diante e SC-901 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cor do ambiente na aba e no terminal (Priority: P1)

Ao cadastrar um host, o usuário escolhe o ambiente dele numa lista curta de cores com nome (por
exemplo "Produção" em vermelho, "Homologação" em amarelo, "Laboratório" em verde). Toda sessão
desse host mostra a cor numa faixa da aba e na borda do terminal, inclusive em painéis divididos,
e o usuário sabe em que tipo de equipamento está antes de apertar Enter.

**Why this priority**: evita o erro mais caro em NOC, que é rodar um comando no equipamento
errado. É o item de maior valor da lista.

**Independent Test**: marcar um host como "Produção", abrir uma sessão dele e outra de um host sem
cor, e conferir a faixa vermelha na aba e na borda só da primeira, com o nome do ambiente
acessível ao leitor de tela.

**Acceptance Scenarios**:

1. **Given** um host com ambiente "Produção", **When** o usuário abre uma sessão dele, **Then** a
   aba e a borda do terminal mostram a cor vermelha e o nome "Produção" aparece no texto
   acessível da aba.
2. **Given** duas sessões lado a lado num grupo dividido, uma de "Produção" e outra sem ambiente,
   **When** o usuário alterna o foco entre os painéis, **Then** cada painel mantém a própria cor e
   o painel focado continua reconhecível pelo destaque de foco.
3. **Given** uma sessão aberta, **When** o usuário troca o ambiente do host no editor e salva,
   **Then** a cor da aba e da borda muda sem reabrir a sessão.
4. **Given** um host sem ambiente, **When** o usuário abre a sessão, **Then** a aba e o terminal
   ficam como hoje.

---

### User Story 2 - Configurações como aba própria (Priority: P1)

O usuário abre as Configurações e elas aparecem como uma aba com ícone e nome, marcada como ativa
na barra de abas, no lugar de se sobrepor à aba que estava aberta. Ele volta ao terminal clicando
na aba dele, e fecha as Configurações como qualquer outra aba.

**Why this priority**: corrige uma confusão visível em todo uso, com mudança pequena.

**Independent Test**: com um terminal e um SFTP abertos, abrir as Configurações e conferir que só a
aba "Configurações" está marcada; clicar na aba do terminal e voltar a ele com a sessão intacta;
fechar a aba das Configurações.

**Acceptance Scenarios**:

1. **Given** uma aba de SFTP ativa, **When** o usuário abre as Configurações, **Then** surge (ou é
   ativada) uma aba "Configurações" com ícone, e só ela fica marcada como ativa.
2. **Given** a aba "Configurações" aberta, **When** o usuário abre as Configurações de novo (botão,
   atalho ou paleta), **Then** a mesma aba é ativada e não surge uma segunda.
3. **Given** a aba "Configurações" ativa, **When** o usuário clica na aba de um terminal, **Then** o
   terminal volta com o conteúdo e a sessão intactos e a aba "Configurações" continua aberta.
4. **Given** a aba "Configurações" ativa, **When** o usuário a fecha (botão de fechar, atalho de
   fechar aba ou Esc), **Then** volta a aba que estava ativa antes, sem pedir confirmação.
5. **Given** a aba "Configurações" aberta, **When** o usuário fecha o app e abre de novo, **Then**
   o app abre sem a aba "Configurações".

---

### User Story 3 - Lista de hosts mais legível (Priority: P2)

O host selecionado na lista lateral ganha uma barra vertical laranja na borda esquerda, além do
fundo. Em Configurações → Aparência, o usuário escolhe a densidade "Compacta", em que cada host
ocupa uma linha só, para ver mais hosts de uma vez.

**Why this priority**: melhora a navegação para quem tem muitos hosts e aplica a cor da marca, mas
não muda o que o app faz.

**Independent Test**: selecionar um host e ver a barra laranja; ligar a densidade compacta e
conferir que a lista mostra pelo menos o dobro de hosts na mesma altura, e que a escolha vale
depois de reiniciar o app.

**Acceptance Scenarios**:

1. **Given** a lista de hosts, **When** o usuário seleciona um host (clique ou teclado), **Then**
   ele mostra a barra laranja na borda esquerda, e só ele.
2. **Given** a densidade "Confortável" (padrão), **When** o usuário escolhe "Compacta", **Then**
   cada host passa a ocupar uma linha, com ícone menor, rótulo e endereço lado a lado, e o
   endereço é cortado com reticências se não couber.
3. **Given** a densidade "Compacta", **When** o usuário reinicia o app, **Then** a lista continua
   compacta.

---

### User Story 4 - Tags e notas no host (Priority: P2)

No editor de host, o usuário adiciona tags curtas ("cliente-x", "olt", "pindoretama") e uma nota de
texto livre ("VLAN 100, contato João, janela de manutenção às 2h"). A busca da lista lateral
encontra o host pelas tags e pela nota, e as tags aparecem na lista.

**Why this priority**: muita gente guarda essas informações fora do app; trazê-las para o host
ajuda, mas exige dado novo no cofre e não é tão urgente quanto as cores.

**Independent Test**: adicionar duas tags e uma nota a um host, buscar por uma tag e por uma
palavra da nota e encontrar o host; fechar e abrir o app e ver os dados intactos.

**Acceptance Scenarios**:

1. **Given** o editor de host, **When** o usuário digita uma tag e aperta Enter ou vírgula,
   **Then** a tag vira um item removível no campo, e tags repetidas não são aceitas.
2. **Given** um host com tags, **When** o usuário olha a lista lateral, **Then** as tags aparecem no
   item do host (na densidade compacta, só a quantidade ou as que couberem).
3. **Given** um host com a tag "olt" e a nota "VLAN 100", **When** o usuário busca "olt" ou "vlan
   100", **Then** o host aparece no resultado.
4. **Given** um host com tags e nota, **When** o cofre é sincronizado, exportado ou duplicado,
   **Then** as tags e a nota vão junto.

---

### User Story 5 - Nome da aba pelo prompt do equipamento (Priority: P3)

Quando a sessão mostra um prompt reconhecível de equipamento de rede, como `<BNG.PINDORETAMA>`,
`[OLT-01]`, `R1#` ou `user@srv:~$`, a aba passa a mostrar o nome extraído dele (`BNG.PINDORETAMA`,
`OLT-01`, `R1`, `srv`). Uma opção em Configurações → Terminal desliga esse comportamento.

**Why this priority**: ajuda quando o rótulo do host é genérico (um IP, por exemplo), mas é
conveniência; o rótulo do host continua útil sem isso.

**Independent Test**: conectar a um equipamento que mostra `<BNG.PINDORETAMA>` e ver a aba trocar
para `BNG.PINDORETAMA`; desligar a opção e ver a aba voltar ao rótulo do host.

**Acceptance Scenarios**:

1. **Given** a opção ligada (padrão), **When** o equipamento mostra o prompt
   `<BNG.PINDORETAMA>`, **Then** a aba passa a se chamar `BNG.PINDORETAMA` e a dica da aba continua
   mostrando o rótulo e o endereço do host.
2. **Given** o usuário renomeou a aba à mão, **When** um novo prompt aparece, **Then** a aba mantém
   o nome que o usuário deu.
3. **Given** a opção desligada, **When** o prompt aparece, **Then** a aba mantém o rótulo do host.
4. **Given** o usuário entra em modo de configuração (`[~BNG.PINDORETAMA]`, `R1(config)#`), **When**
   o prompt muda, **Then** o nome da aba continua o mesmo nome base do equipamento.

---

### User Story 6 - Campo de porta simples (Priority: P3)

No editor de host, a porta é um campo numérico comum, sem os botões − e +. O usuário seleciona o
valor e digita a porta nova.

**Why this priority**: ganho pequeno, mas trivial de fazer junto.

**Independent Test**: abrir o editor, trocar 22 por 2222 digitando, salvar e conferir a porta.

**Acceptance Scenarios**:

1. **Given** o editor de host, **When** o usuário foca o campo de porta, **Then** o valor inteiro é
   selecionado e não há botões − e + ao lado.
2. **Given** o campo de porta, **When** o usuário digita algo fora de 1–65535 ou não numérico,
   **Then** o formulário mostra o erro de porta inválida e não salva.
3. **Given** o campo de porta focado, **When** o usuário aperta seta para cima ou para baixo,
   **Then** a porta sobe ou desce de 1, como hoje.

---

### Edge Cases

- Host com ambiente cujo nome ou cor o usuário apagou da lista de ambientes: a sessão volta a ficar
  sem cor, sem erro.
- Tema claro e tema escuro, e esquemas de cor do terminal com fundo vermelho ou amarelo: a faixa do
  ambiente continua visível (contraste mínimo de 3:1 com o fundo da barra de abas).
- Daltonismo: a cor nunca é o único sinal; o nome do ambiente aparece na dica da aba, no cabeçalho
  do painel dividido e no texto do leitor de tela.
- Aba "Configurações" ativa quando um terminal pede atenção (aviso de chave do servidor, senha,
  desconexão): o diálogo aparece normalmente, como acontece com outra aba ativa.
- Atalhos de terminal (copiar, colar, buscar, dividir) com a aba "Configurações" ativa: não agem
  sobre nenhum terminal.
- Arrastar a aba "Configurações" para dentro de um grupo dividido: não é permitido.
- Tag com espaços nas pontas, maiúsculas ou acento: é guardada sem os espaços, e a busca não
  diferencia maiúsculas nem acentos. Tag com mais de 32 caracteres ou mais de 20 tags por host:
  recusadas com mensagem.
- Nota muito longa: limite de 2.000 caracteres, com contador.
- Prompt que muda a cada linha (saída de comando parecida com um prompt): a aba só troca de nome
  com um prompt no fim da tela, à espera de digitação, e não troca mais de uma vez por segundo.
- Prompt com caracteres de controle ou mais de 64 caracteres: ignorado.
- Cofre aberto por uma versão antiga do app depois de ganhar tags e notas: a versão antiga abre e
  ignora os campos novos; se ela editar o host, os campos novos daquele host se perdem. Registrado
  nas notas de versão (o app se atualiza sozinho desde a 0.6.0).
- Arquivo de exportação com tags e notas aberto por uma versão antiga: recusado com o aviso de
  arquivo de versão mais nova.

## Requirements *(mandatory)*

### Functional Requirements

**Ambiente (US1)**

- **FR-901**: Usuários MUST poder escolher, no editor de host, um ambiente de uma lista com nome e
  cor, ou "Nenhum" (padrão).
- **FR-902**: A lista de ambientes MUST vir com quatro itens prontos (Produção / vermelho,
  Homologação / amarelo, Laboratório / verde, Cliente / azul-acinzentado) e permitir renomear, mudar
  a cor (entre 8 cores pré-definidas com contraste conferido nos dois temas), adicionar e remover
  ambientes em Configurações → Aparência.
- **FR-903**: Toda aba de sessão (terminal e SFTP) de um host com ambiente MUST mostrar a cor numa
  faixa visível em qualquer estado da aba (ativa, inativa, com atividade).
- **FR-904**: O terminal de um host com ambiente MUST ter uma borda na cor do ambiente, também em
  cada painel de um grupo dividido; o destaque de foco do painel MUST continuar distinguível da
  borda do ambiente.
- **FR-905**: O nome do ambiente MUST aparecer na dica da aba, no cabeçalho do painel e no nome
  acessível da aba.
- **FR-906**: Trocar ou remover o ambiente de um host MUST atualizar as sessões abertas em até 1
  segundo, sem reconectar.
- **FR-907**: O ambiente do host MUST ser guardado no cofre e seguir com o host na sincronização,
  na exportação no formato próprio do OpenHost e ao duplicar o host.

**Configurações como aba (US2)**

- **FR-908**: Abrir as Configurações (botão, atalho ou paleta) MUST abrir uma aba "Configurações"
  com ícone, ou ativar a existente; nunca MUST existir mais de uma.
- **FR-909**: Com a aba "Configurações" ativa, nenhuma outra aba MUST aparecer como ativa.
- **FR-910**: Ativar outra aba MUST mostrar aquela aba sem fechar as Configurações nem perder o
  estado das sessões.
- **FR-911**: Fechar a aba "Configurações" MUST ativar a aba que estava ativa antes dela (ou a tela
  vazia, se não houver outra) e MUST NOT pedir confirmação.
- **FR-912**: A aba "Configurações" MUST NOT entrar em grupo dividido nem ser restaurada ao abrir o
  app.

**Lista de hosts (US3)**

- **FR-913**: O host selecionado na lista lateral MUST mostrar uma barra vertical na cor de destaque
  da marca na borda esquerda, além do fundo de seleção atual.
- **FR-914**: Usuários MUST poder escolher a densidade da lista entre "Confortável" (padrão, como
  hoje) e "Compacta" (uma linha por host); a escolha MUST ser guardada entre execuções.
- **FR-915**: Na densidade compacta, cada host MUST ocupar no máximo metade da altura que ocupa na
  confortável, mantendo ícone, rótulo, endereço e o indicador de sessão aberta.

**Tags e notas (US4)**

- **FR-916**: O editor de host MUST ter um campo de tags (até 20 por host, até 32 caracteres cada,
  sem repetição, sem diferenciar maiúsculas) e um campo de nota de texto livre (até 2.000
  caracteres).
- **FR-917**: A busca da lista lateral MUST encontrar hosts pelo texto das tags e da nota, sem
  diferenciar maiúsculas nem acentos.
- **FR-918**: As tags MUST aparecer no item do host na lista lateral.
- **FR-919**: Tags e nota MUST ser guardadas no cofre criptografado e seguir com o host na
  sincronização, na exportação e importação no formato próprio do OpenHost e ao duplicar o host.
- **FR-920**: Cofres existentes MUST abrir sem migração manual, com hosts sem tags, nota nem
  ambiente; a ida e volta (salvar, sincronizar, exportar e importar) MUST ter teste.

**Porta (US6)**

- **FR-921**: O campo de porta MUST ser um campo numérico sem botões de incremento, que seleciona o
  valor ao receber o foco, aceita setas para cima e para baixo e valida a faixa 1–65535.

**Nome pelo prompt (US5)**

- **FR-922**: Com a opção "Nome da aba pelo prompt" ligada (padrão), a aba de terminal SSH MUST
  passar a mostrar o nome extraído do prompt quando ele tiver uma das formas reconhecidas:
  `<NOME>`, `[NOME]`, `[~NOME]`, `[*NOME]`, `NOME#`, `NOME>`, `NOME(config...)#` e
  `usuário@NOME:caminho$`/`#`.
- **FR-923**: O nome MUST ser atualizado só a partir da última linha visível, quando ela termina no
  prompt, no máximo uma vez por segundo, e MUST ignorar nomes com caracteres de controle ou mais de
  64 caracteres.
- **FR-924**: Uma aba renomeada à mão MUST NOT ser renomeada pelo prompt.
- **FR-925**: Desligar a opção MUST devolver às abas abertas o rótulo do host (exceto as
  renomeadas à mão).
- **FR-926**: A dica da aba MUST continuar mostrando o rótulo e o endereço do host.

**Geral**

- **FR-927**: Todos os textos novos MUST estar em português do Brasil e seguir a identidade visual
  (preto piano com o laranja do chevron como destaque).
- **FR-928**: Os novos controles MUST ser operáveis só pelo teclado e ter nome acessível.

### Key Entities

- **Ambiente**: nome e cor que classificam hosts (ex.: Produção / vermelho). Lista de preferência
  do usuário, guardada no cofre junto das outras preferências; um host aponta para no máximo um.
- **Host** (existente): ganha ambiente (opcional), tags (lista de textos curtos) e nota (texto
  livre).
- **Preferências de interface** (existente): ganham a densidade da lista e a opção de nome da aba
  pelo prompt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-901**: Em um teste com 5 sessões abertas de ambientes diferentes, o usuário identifica qual
  aba é de produção em até 2 segundos, sem abrir a dica da aba.
- **SC-902**: Com as Configurações abertas, a barra de abas mostra exatamente uma aba ativa em 100%
  dos casos testados (vindo de terminal, SFTP, grupo dividido e tela vazia).
- **SC-903**: Na densidade compacta, a lista mostra pelo menos o dobro de hosts na mesma altura
  de janela que na confortável.
- **SC-904**: Um host é encontrado pela busca por qualquer uma das suas tags ou por uma palavra da
  nota, em uma lista de 500 hosts, com o resultado aparecendo enquanto se digita.
- **SC-905**: Trocar a porta de 22 para 2222 leva no máximo um foco e a digitação dos quatro
  dígitos.
- **SC-906**: Para os 10 formatos de prompt da lista de testes (Huawei, ZTE, Cisco, Juniper,
  Mikrotik, Datacom e shell Linux), a aba mostra o nome certo do equipamento em até 1 segundo
  depois do prompt aparecer, e nenhuma linha de saída comum troca o nome da aba.
- **SC-907**: Nenhum dado de host (tags, nota, ambiente) é perdido na migração do cofre nem na ida e
  volta de exportação/importação e sincronização.

## Assumptions

- A lista de ambientes é global (do cofre), não por grupo; o ambiente não é herdado do grupo nesta
  versão.
- A faixa na aba é uma barra fina na borda superior da aba, e a borda do terminal é fina (2 px);
  os detalhes visuais ficam para o plano, com os testes de contraste.
- Formatos de importação de outros apps (PuTTY, SecureCRT, MobaXterm, OpenSSH) não trazem ambiente
  nem tags nesta versão; o formato próprio do OpenHost passa a trazer.
- O nome pelo prompt vale só para sessões SSH. Terminais locais mantêm o nome atual.
- A aba "Configurações" substitui a sobreposição atual por completo; as seções das Configurações
  continuam as mesmas.
- Esta spec depende da 008 (sincronização) para os campos novos seguirem na nuvem; se a 008 sair
  depois, os campos novos entram na lista de itens sincronizados dela.
- A mudança de esquema do cofre (tags, nota, ambiente) é a próxima versão depois da da 008.

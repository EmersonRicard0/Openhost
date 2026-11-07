# Feature Specification: Importar e exportar hosts

**Feature Branch**: `003-host-import-export`

**Created**: 2026-10-25

**Status**: Draft

**Input**: User description: "Importar e exportar hosts no OpenHost. Uma tela \"Importar e exportar\" (nas configurações e no menu da lista de hosts) permite importar hosts e grupos de: ~/.ssh/config (Host, HostName, Port, User, IdentityFile; Include; ignorar curingas), sessões do PuTTY/KiTTY no registro do Windows (só sessões SSH), arquivo CSV/planilha (colunas nome, endereço, porta, usuário, grupo; modelo baixável), MobaXterm (.mxtsessions/.ini, pastas viram grupos) e SecureCRT (XML de sessões, pastas viram grupos). Credenciais: importar só chaves privadas referenciadas (IdentityFile, chave do PuTTY .ppk se suportado), guardadas no cofre; senhas nunca são importadas, o usuário digita na primeira conexão. Antes de gravar, mostrar uma prévia com a lista de hosts encontrados, marcar/desmarcar, apontar duplicados (mesmo endereço+porta+usuário) com opção pular/substituir/manter os dois, e avisos por linha (porta inválida, chave não encontrada). Grupo de destino escolhível. Exportar: hosts e grupos (sem senhas; chaves opcionais e só com o cofre desbloqueado e confirmação) num arquivo do OpenHost que pode ser importado de volta em outro PC; também exportar para ~/.ssh/config e CSV. Interface em pt-BR, visual preto piano com destaque laranja. Retirar \"importação de ~/.ssh/config\" da lista \"fora desta feature\" da 002."

## Contexto

Quem chega ao OpenHost (nome visível do ShellVault) já tem dezenas ou centenas de hosts
cadastrados em outro cliente: `~/.ssh/config`, PuTTY/KiTTY, MobaXterm, SecureCRT ou uma
planilha da equipe de NOC. Hoje cada host precisa ser digitado de novo, o que trava a adoção.
Também não há como levar os hosts para outro PC nem fazer um backup legível fora do cofre.

Esta feature acrescenta uma tela "Importar e exportar". Ela traz hosts, grupos e chaves
privadas dessas origens, sempre com uma prévia antes de gravar, e exporta para um arquivo do
OpenHost reimportável, para `~/.ssh/config` e para CSV. Senhas nunca entram nem saem por aqui.

A 002 listava "importação de `~/.ssh/config`" como fora do escopo; esse item passa para esta
feature.

Os requisitos usam a faixa FR-301 em diante e SC-301 em diante, para não colidir com a 002
(FR-101 a FR-178).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Importar do `~/.ssh/config` com prévia (Priority: P1)

O operador abre "Importar e exportar", escolhe "Configuração do OpenSSH" e o app lê
`%USERPROFILE%\.ssh\config` (ou outro arquivo que ele escolher). Aparece uma prévia com cada
host encontrado: rótulo, endereço, porta, usuário, chave e avisos. Ele desmarca dois hosts,
escolhe o grupo de destino e confirma. Os hosts aparecem na barra lateral prontos para
conectar com a chave já no cofre.

**Why this priority**: é a origem mais comum entre quem usa SSH no dia a dia e, sozinha, já
tira o maior obstáculo de adoção. A prévia, a detecção de duplicados e o fluxo de gravação
criados aqui são reaproveitados por todas as outras origens.

**Independent Test**: com um `config` de exemplo contendo hosts simples, curingas, `Include`
e `IdentityFile`, importar e conferir que só os hosts concretos foram criados, com a chave
no cofre, e que conectar a um deles autentica pela chave sem pedir senha.

**Acceptance Scenarios**:

1. **Given** um `config` com `Host web1` (`HostName 10.0.0.5`, `Port 2222`, `User deploy`,
   `IdentityFile ~/.ssh/id_ed25519`), **When** o usuário importa, **Then** a prévia mostra
   `web1` com 10.0.0.5:2222, usuário `deploy` e a chave `id_ed25519`; depois de confirmar, o
   host existe no grupo escolhido e usa a chave importada para o cofre.
2. **Given** blocos `Host *` e `Host *.interno`, **When** a prévia abre, **Then** eles não
   viram hosts; suas opções (`User`, `Port`, `IdentityFile`) valem como padrão para os hosts
   concretos que casam com o padrão, na ordem em que o OpenSSH as aplicaria.
3. **Given** uma linha `Include config.d/*`, **When** o usuário importa, **Then** os hosts dos
   arquivos incluídos aparecem na prévia, cada um indicando o arquivo de origem.
4. **Given** um `IdentityFile` que não existe no disco, **When** a prévia abre, **Then** a
   linha mostra o aviso "chave não encontrada" e, se importada, o host fica sem chave
   (autenticação por senha, pedida na conexão).
5. **Given** uma chave com passphrase, **When** o usuário confirma, **Then** o app pede a
   passphrase uma vez por chave, guarda a chave no cofre e permite pular a chave sem
   interromper os demais hosts.

---

### User Story 2 - Exportar para um arquivo do OpenHost e importar em outro PC (Priority: P1)

O operador vai trocar de computador. Exporta todos os hosts e grupos para um arquivo do
OpenHost. Opcionalmente marca "incluir chaves privadas", confirma com a senha mestra e define
uma senha para o arquivo. No PC novo, importa o arquivo e encontra a mesma árvore de grupos,
os mesmos hosts e as chaves, sem nenhuma senha de servidor.

**Why this priority**: backup e migração entre PCs é o segundo pedido mais comum e também é o
único caminho de volta para quem quer levar a configuração inteira.

**Independent Test**: exportar um cofre com grupos aninhados, hosts com opções variadas
(algoritmos legados, ícone, perfil próprio) e uma chave; importar em um cofre vazio e
comparar campo a campo.

**Acceptance Scenarios**:

1. **Given** um cofre com grupos aninhados e hosts, **When** o usuário exporta sem chaves,
   **Then** o arquivo contém grupos e hosts com todas as opções que não são segredo e nenhuma
   senha, passphrase ou chave privada.
2. **Given** a opção "incluir chaves privadas", **When** o usuário exporta, **Then** o app exige
   a senha mestra, pede uma senha para o arquivo (digitada duas vezes) e grava o arquivo
   inteiro criptografado; sem essa senha o arquivo não pode ser lido.
3. **Given** um arquivo exportado com chaves, **When** outro cofre o importa e o usuário
   informa a senha do arquivo, **Then** grupos, hosts e chaves são recriados, e os hosts que
   usavam senha ficam sem credencial, pedindo a senha na primeira conexão.
4. **Given** o mesmo arquivo importado duas vezes, **When** a prévia abre na segunda vez,
   **Then** todos os hosts aparecem como duplicados com a ação "pular" já escolhida.

---

### User Story 3 - Importar sessões do PuTTY/KiTTY (Priority: P2)

O operador usa PuTTY há anos. Escolhe "PuTTY / KiTTY" e o app lista as sessões salvas no
Windows. Só as sessões SSH entram na prévia; as de Telnet, serial e raw aparecem como
ignoradas com o motivo.

**Why this priority**: PuTTY é o cliente mais usado no Windows, público principal do app.

**Independent Test**: criar sessões de teste no registro (SSH com e sem chave `.ppk`, uma
Telnet, a sessão "Default Settings") e conferir a prévia e o resultado.

**Acceptance Scenarios**:

1. **Given** uma sessão SSH com host, porta, usuário e chave `.ppk`, **When** o usuário
   importa, **Then** o host é criado com esses dados e a chave convertida e guardada no cofre.
2. **Given** a sessão "Default Settings" e uma sessão Telnet, **When** a prévia abre, **Then**
   nenhuma das duas vira host; a Telnet aparece como ignorada ("protocolo não suportado").
3. **Given** sessões KiTTY gravadas no registro, **When** o usuário escolhe a origem, **Then**
   elas aparecem junto às do PuTTY, cada uma indicando de qual programa veio.
4. **Given** uma sessão com nome codificado (ex.: `Roteador%20Core`), **When** a prévia abre,
   **Then** o rótulo aparece decodificado ("Roteador Core").

---

### User Story 4 - Importar uma planilha CSV (Priority: P2)

A equipe de NOC mantém uma planilha com centenas de equipamentos. O operador baixa o modelo
CSV do app, cola os dados, salva e importa. As colunas de grupo viram a árvore de grupos.

**Why this priority**: listas grandes de equipamentos (OLTs, roteadores) vivem em planilhas;
é a forma mais rápida de cadastrar um parque inteiro.

**Independent Test**: importar o modelo preenchido com 500 linhas, incluindo linhas inválidas,
grupos aninhados e separador `;`, e conferir contagens e avisos.

**Acceptance Scenarios**:

1. **Given** o modelo baixado pelo app, **When** o usuário o abre numa planilha, **Then** ele tem
   as colunas `nome`, `endereco`, `porta`, `usuario`, `grupo` e `chave` com uma linha de
   exemplo.
2. **Given** um CSV salvo pelo Excel em pt-BR (separador `;`, codificação Windows-1252 ou UTF-8
   com BOM), **When** o usuário importa, **Then** o separador e a codificação são detectados e
   os acentos aparecem corretos.
3. **Given** a coluna `grupo` com `Clientes/Norte/OLTs`, **When** o usuário confirma, **Then** os
   grupos `Clientes > Norte > OLTs` são criados (ou reaproveitados se já existirem) e o host
   fica no último.
4. **Given** uma linha com porta `99999` ou sem endereço, **When** a prévia abre, **Then** a
   linha fica desmarcada com o aviso correspondente e não pode ser marcada até ser corrigida
   na própria prévia.
5. **Given** colunas com nomes diferentes (`host`, `ip`, `user`), **When** a prévia abre,
   **Then** o app reconhece os sinônimos comuns e, se alguma coluna obrigatória não for
   reconhecida, deixa o usuário escolher qual coluna é qual.

---

### User Story 5 - Importar do MobaXterm e do SecureCRT (Priority: P3)

O operador vem do MobaXterm ou do SecureCRT. Escolhe a origem, aponta o arquivo de sessões
(`.mxtsessions` / `MobaXterm.ini` ou o XML exportado pelo SecureCRT) e as pastas viram grupos.

**Why this priority**: clientes muito usados em NOC, mas cada um com público menor que
`~/.ssh/config` e PuTTY.

**Independent Test**: importar arquivos de exemplo de cada programa com pastas aninhadas,
sessões SSH e não SSH, e conferir a árvore de grupos e os hosts criados.

**Acceptance Scenarios**:

1. **Given** um `.mxtsessions` com pastas e sessões SSH, RDP e Telnet, **When** o usuário
   importa, **Then** só as SSH viram hosts, nas pastas correspondentes, e as demais aparecem
   como ignoradas com o protocolo.
2. **Given** um XML de sessões do SecureCRT com pastas, **When** o usuário importa, **Then**
   hostname, porta, usuário e pasta de cada sessão SSH2 são preservados.
3. **Given** sessões com senha salva no programa de origem, **When** a importação termina,
   **Then** nenhuma senha foi lida ou gravada e o resumo informa que as senhas precisarão ser
   digitadas na primeira conexão.

---

### User Story 6 - Exportar para `~/.ssh/config` e CSV (Priority: P3)

O operador quer usar os hosts também no `ssh` do terminal ou compartilhar a lista com a
equipe. Exporta para um arquivo no formato do `~/.ssh/config` ou para CSV no mesmo modelo da
importação.

**Why this priority**: útil para interoperar e compartilhar, mas não bloqueia a adoção.

**Independent Test**: exportar para os dois formatos, importar cada arquivo num cofre vazio e
conferir que os dados não secretos voltam iguais.

**Acceptance Scenarios**:

1. **Given** hosts selecionados ou um grupo inteiro, **When** o usuário exporta para o formato
   do OpenSSH, **Then** o arquivo tem um bloco `Host` por host com `HostName`, `Port` e `User`,
   e o caminho do grupo como comentário acima de cada bloco.
2. **Given** o arquivo de destino `~/.ssh/config` já existe, **When** o usuário exporta para ele,
   **Then** o app nunca sobrescreve: oferece salvar com outro nome ou acrescentar ao final
   entre marcadores de início e fim do OpenHost, guardando antes uma cópia do original.
3. **Given** a exportação CSV, **When** o arquivo é aberto no Excel em pt-BR, **Then** colunas e
   acentos aparecem corretos e o mesmo arquivo pode ser reimportado sem ajustes.

---

### Edge Cases

- **Arquivo muito grande ou malformado**: linhas que não puderem ser lidas viram avisos na
  prévia com o número da linha; o restante continua importável. Arquivos acima de 10 MB são
  recusados com mensagem clara.
- **Nenhum host encontrado**: a prévia mostra "Nenhum host encontrado" e explica o que foi
  procurado (ex.: "sessões SSH do PuTTY"), sem botão de importar.
- **Cofre bloqueado no meio da importação** (bloqueio automático por inatividade): a importação
  em andamento termina ou é desfeita por inteiro; nunca fica pela metade. Exportar exige o
  cofre desbloqueado.
- **Duplicados dentro do próprio arquivo de origem**: aparecem na prévia como duplicados entre
  si, além dos duplicados com o cofre.
- **Rótulo repetido com endereço diferente**: não é duplicado; os dois são importados e a prévia
  avisa que o rótulo se repete.
- **Chave em formato não suportado** (ex.: `.ppk` corrompido, tipo de chave que o app não
  aceita): a linha recebe o aviso e o host pode ser importado sem a chave.
- **Mesma chave referenciada por vários hosts**: guardada uma única vez no cofre e compartilhada,
  pedindo a passphrase uma só vez.
- **Chave já existente no cofre** (mesma impressão digital): reaproveitada, sem duplicar.
- **Opções sem equivalente no OpenHost** (`ProxyJump`, `LocalForward`, X11, túneis do PuTTY):
  ignoradas com aviso por linha; o host é importado mesmo assim.
- **Arquivo do OpenHost de versão mais nova** que a do app: recusado com mensagem pedindo para
  atualizar o app; de versão mais antiga: aceito.
- **Senha do arquivo exportado incorreta**: mensagem "senha incorreta" sem revelar mais nada;
  tentativas ilimitadas, cada uma com o custo da derivação de chave.
- **Endereço IPv6** (com ou sem colchetes) e nomes com acento: preservados.
- **Grupo de destino apagado** enquanto a prévia está aberta: a importação usa a raiz e avisa.

## Requirements *(mandatory)*

### Functional Requirements

**Tela e fluxo**

- **FR-301**: O app MUST ter uma tela "Importar e exportar", acessível nas configurações e no
  menu da barra lateral de hosts, disponível apenas com o cofre desbloqueado.
- **FR-302**: A importação MUST seguir sempre três passos: escolher a origem, revisar a prévia e
  confirmar; nada é gravado no cofre antes da confirmação.
- **FR-303**: A prévia MUST listar cada host encontrado com rótulo, endereço, porta, usuário,
  grupo de origem, chave (se houver), arquivo ou sessão de origem e avisos, permitindo marcar
  e desmarcar linhas individualmente, todas de uma vez e por grupo.
- **FR-304**: A prévia MUST permitir corrigir rótulo, endereço, porta e usuário de uma linha
  antes de importar; linhas inválidas (sem endereço, porta fora de 1–65535) MUST ficar
  desmarcadas e bloqueadas até serem corrigidas.
- **FR-305**: O usuário MUST poder escolher o grupo de destino (raiz por padrão); a árvore de
  grupos da origem é criada abaixo dele, reaproveitando grupos com o mesmo nome no mesmo nível.
- **FR-306**: Um host é duplicado quando endereço (sem diferenciar maiúsculas), porta e usuário
  coincidem com um host do cofre ou com outra linha da mesma origem. Para cada duplicado o
  usuário MUST poder escolher "pular" (padrão), "substituir" ou "manter os dois", por linha ou
  para todos de uma vez.
- **FR-307**: "Substituir" MUST atualizar apenas os campos trazidos pela origem, preservando a
  credencial de senha, o perfil de terminal, o ícone e as regras de encaminhamento do host
  existente.
- **FR-308**: A gravação MUST ser atômica: ou todos os hosts, grupos e chaves marcados são
  gravados, ou nada muda no cofre.
- **FR-309**: Ao terminar, o app MUST mostrar um resumo com quantos hosts foram criados,
  substituídos, pulados e ignorados, quantas chaves foram guardadas e quantos hosts vão pedir
  senha na primeira conexão.
- **FR-310**: A importação MUST poder ser desfeita uma vez, pelo botão "Desfazer" no resumo ou no
  aviso exibido logo após importar, removendo os hosts, grupos e chaves criados e restaurando
  os substituídos, desde que eles não tenham sido alterados depois.

**Origens**

- **FR-311**: O app MUST importar do formato de configuração do OpenSSH, lendo por padrão
  `%USERPROFILE%\.ssh\config` e aceitando outro arquivo escolhido pelo usuário. Usa `Host`,
  `HostName`, `Port`, `User` e `IdentityFile`; segue `Include` (caminhos relativos e curingas,
  até 8 níveis, sem repetir arquivos); padrões com curinga ou negação não viram hosts, mas suas
  opções valem para os hosts concretos que casam, com a regra do OpenSSH de que o primeiro
  valor obtido prevalece. `Host` com vários nomes gera um host por nome concreto. `Match` é
  ignorado com aviso.
- **FR-312**: O app MUST importar as sessões salvas do PuTTY e do KiTTY no registro do usuário do
  Windows, só as de protocolo SSH, decodificando o nome da sessão, ignorando "Default Settings"
  e indicando o programa de origem. Sessões de KiTTY no modo portátil (arquivos) MUST poder ser
  importadas apontando a pasta.
- **FR-313**: O app MUST importar CSV com as colunas `nome`, `endereco`, `porta`, `usuario`,
  `grupo` e `chave` (só `endereco` obrigatória), reconhecendo sinônimos comuns em português e
  inglês, detectando separador (`,` `;` tab) e codificação (UTF-8 com ou sem BOM,
  Windows-1252), e usando `/` como separador de grupos aninhados. Quando uma coluna
  obrigatória não for reconhecida, o usuário MUST poder mapear as colunas manualmente.
- **FR-314**: O app MUST oferecer o download de um modelo CSV com as colunas e uma linha de
  exemplo.
- **FR-315**: O app MUST importar sessões SSH do MobaXterm (`.mxtsessions` e `MobaXterm.ini`),
  convertendo pastas em grupos.
- **FR-316**: O app MUST importar sessões SSH2 do arquivo XML de configuração exportado pelo
  SecureCRT, convertendo pastas em grupos.
- **FR-317**: O app MUST importar o arquivo de exportação do OpenHost (FR-325), recriando grupos,
  hosts e todas as opções não secretas, e chaves quando presentes.
- **FR-318**: Sessões de protocolos não SSH e opções sem equivalente no app (`ProxyJump`,
  encaminhamentos, X11, túneis) MUST aparecer como ignoradas ou como aviso, com o motivo, sem
  impedir a importação do restante.

**Credenciais**

- **FR-319**: Senhas MUST NOT ser lidas, importadas ou exportadas por nenhuma origem ou destino,
  mesmo quando a origem as guarda (cifradas ou não). Hosts importados sem chave ficam com
  autenticação por senha e pedem a senha na primeira conexão, com a opção de salvá-la no cofre
  como já acontece hoje.
- **FR-320**: Chaves privadas referenciadas pela origem (`IdentityFile`, chave da sessão do
  PuTTY/KiTTY/MobaXterm/SecureCRT, coluna `chave` do CSV) MUST ser lidas do disco e guardadas no
  cofre como credenciais, nos formatos já aceitos pelo app e também no formato `.ppk` do PuTTY
  (versões 2 e 3), convertido ao importar.
- **FR-321**: Chaves com passphrase MUST ter a passphrase pedida uma vez por chave, com a opção
  de pular a chave; a passphrase segue a regra atual do cofre e nunca é gravada fora dele.
- **FR-322**: Uma chave usada por vários hosts, ou já presente no cofre (mesma impressão
  digital), MUST ser guardada uma única vez e compartilhada.
- **FR-323**: O arquivo de chave original no disco MUST NOT ser alterado, movido ou apagado.

**Exportação**

- **FR-324**: O usuário MUST poder exportar todos os hosts, um grupo (com subgrupos) ou os hosts
  selecionados, escolhendo o formato e o arquivo de destino numa janela de salvar do sistema.
- **FR-325**: O formato do OpenHost MUST conter versão do formato, grupos com hierarquia e
  hosts com todas as opções que não são segredo (rótulo, endereço, porta, usuário, método de
  autenticação, algoritmos legados, ícone, perfil próprio de terminal, regras de
  encaminhamento), e MUST ser legível por versões futuras do app.
- **FR-326**: Por padrão a exportação no formato do OpenHost MUST NOT conter chaves privadas.
  Incluí-las MUST exigir confirmação explícita, a senha mestra e uma senha para o arquivo
  (digitada duas vezes, com indicação de força); nesse caso o arquivo inteiro MUST ser
  criptografado com algoritmo autenticado e chave derivada da senha por função resistente a
  força bruta, como o cofre.
- **FR-327**: A exportação para o formato do OpenSSH MUST gerar um bloco `Host` por host com
  `HostName`, `Port` (quando diferente de 22) e `User`, e o caminho do grupo como comentário;
  rótulos com espaço ou caracteres inválidos MUST ser convertidos num apelido válido e
  único, mantendo o rótulo original no comentário. Chaves não são exportadas nesse formato.
- **FR-328**: Ao exportar para um arquivo que já existe, o app MUST pedir confirmação; para o
  `~/.ssh/config` do usuário MUST oferecer apenas "salvar com outro nome" ou "acrescentar ao
  final" entre marcadores do OpenHost, gravando antes uma cópia `config.bak-<data>`. Uma
  nova exportação para o mesmo arquivo MUST substituir só o trecho entre os marcadores.
- **FR-329**: A exportação CSV MUST usar o mesmo modelo de colunas da importação, em UTF-8 com
  BOM e separador `;`, reimportável sem ajustes; a coluna `chave` fica vazia.

**Segurança e interface**

- **FR-330**: Nenhum conteúdo de chave privada, passphrase ou senha de arquivo MUST aparecer em
  logs, mensagens de erro, arquivos temporários ou na área de transferência; os avisos da
  prévia citam apenas o caminho e o nome da chave.
- **FR-331**: A leitura de arquivos e do registro MUST acontecer no processo do app, nunca na
  interface; a interface recebe apenas a prévia já interpretada, sem conteúdo de chaves.
- **FR-332**: A tela MUST seguir o visual do app (preto piano com destaque laranja, textos em
  pt-BR, navegação por teclado completa e leitor de tela), mostrando progresso quando a leitura
  ou a gravação passar de 1 segundo.

### Key Entities *(include if feature involves data)*

- **Origem de importação**: o tipo (OpenSSH, PuTTY/KiTTY, CSV, MobaXterm, SecureCRT, arquivo do
  OpenHost) e o local lido (arquivo, pasta ou registro).
- **Prévia de importação**: lista temporária, só em memória, de hosts candidatos com dados
  interpretados, grupo de origem, referência à chave (caminho, não conteúdo), estado
  (marcado, inválido, duplicado, ignorado), ação para duplicado e avisos. Descartada ao fechar.
- **Lote de importação**: registro do que uma importação criou ou substituiu, usado para
  desfazer (FR-310); só o último lote fica disponível.
- **Arquivo de exportação do OpenHost**: versão do formato, data, grupos, hosts e, se o
  usuário escolheu, chaves; criptografado quando contém chaves.
- **Host, Grupo e Credencial**: os mesmos da 002; nenhum campo novo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-301**: Um usuário com 50 hosts no `~/.ssh/config` consegue tê-los todos no OpenHost,
  prontos para conectar, em menos de 1 minuto e com no máximo 4 cliques depois de abrir a tela.
- **SC-302**: A prévia de um arquivo com 1.000 hosts aparece em até 3 segundos e a gravação
  termina em até 5 segundos.
- **SC-303**: Exportar o cofre inteiro no formato do OpenHost e importá-lo num cofre vazio
  reproduz 100% dos grupos, hosts e opções não secretas, campo a campo.
- **SC-304**: Nenhuma senha é importada ou exportada em nenhum formato, e nenhum segredo aparece
  em arquivos fora do cofre, exceto chaves num arquivo de exportação criptografado pedido pelo
  usuário — verificado por varredura automatizada dos arquivos gerados e dos dados do app.
- **SC-305**: Importar o mesmo arquivo duas vezes seguidas não cria nenhum host repetido com as
  ações padrão.
- **SC-306**: Para cada origem, os arquivos de exemplo dos testes (com casos válidos, inválidos
  e não suportados) são importados sem erro fatal, com 100% das linhas inválidas sinalizadas
  na prévia.
- **SC-307**: Em caso de falha durante a gravação, o cofre fica exatamente como estava antes,
  verificado por teste que interrompe a gravação no meio.

## Assumptions

- "Outros clientes" foi interpretado como **MobaXterm e SecureCRT**, os mais usados em NOC no
  Windows; Termius, Royal TS e outros ficam fora desta feature.
- O SecureCRT é lido a partir do XML gerado pela própria exportação de configurações do
  programa; a leitura direta da pasta de sessões `.ini` fica fora.
- Planilhas são importadas como CSV; arquivos `.xlsx` não são lidos diretamente (o modelo
  orienta salvar como CSV).
- Chaves só são importadas a partir de arquivos acessíveis no disco; chaves apenas no Pageant
  ou no agente SSH não são copiadas (o host pode usar o método "agente SSH" já existente).
- Exportar sem chaves gera um arquivo sem criptografia, pois contém só dados não secretos;
  endereços e usuários continuam sendo informação sensível da equipe, e a tela avisa isso.
- O desfazer vale só para a última importação e enquanto o app estiver aberto.
- Encaminhamentos e `ProxyJump` da origem não são convertidos; ficam para a Fase 2, junto com
  o ProxyJump da 002.
- Ao concluir esta spec, a 002 deixa de listar "importação de `~/.ssh/config`" entre os itens
  fora de escopo.

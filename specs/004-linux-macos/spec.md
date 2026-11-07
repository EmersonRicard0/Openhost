# Feature Specification: OpenHost no Linux e no macOS

**Feature Branch**: `003-host-import-export` (sai junto com a 003 na versão 0.4.0)

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Instaladores e suporte a Linux e macOS para o OpenHost, lançados junto com a versão 0.4.0 (a mesma release da importação/exportação da 003). Hoje o app só roda no Windows (Wails v2 + WebView2): o terminal local usa ConPTY e o registro do Windows, e há código só de Windows na janela (barra de título própria, efeitos visuais), no WebView2, no agente SSH e nos erros do sistema. Objetivo: o mesmo app, com as mesmas funções (cofre criptografado, SSH, SFTP, encaminhamento de portas, terminal local, perfis, importar/exportar), rodando no Linux (WebKitGTK) e no macOS (WebKit), com o cofre no diretório de dados padrão de cada sistema, shells locais detectados por sistema (bash, zsh, fish etc.), agente SSH via SSH_AUTH_SOCK, atalhos com Cmd no macOS e barra de título adequada (botões nativos no macOS). Origens de importação que só existem no Windows (PuTTY/KiTTY no registro) ficam indisponíveis fora dele; o KiTTY portátil e os demais formatos funcionam em todos. Distribuição: macOS em .dmg sem assinatura da Apple (com instrução de como abrir na primeira vez), para Intel e Apple Silicon; Linux em AppImage, .deb e .rpm (amd64; arm64 se o build permitir). A release 0.4.0 publica os instaladores dos três sistemas pelo workflow de release no GitHub, com CI que compila e testa nos três. Decisões do usuário: macOS sem assinatura; Linux com AppImage, .deb e .rpm; tudo sai junto na 0.4.0."

## Contexto

O OpenHost só existe para Windows. Quem administra redes e servidores costuma ter também um
notebook com macOS ou uma estação Linux, e hoje precisa de outro cliente SSH nesses
computadores, com outro cadastro de hosts. A importação e exportação da 003 já permite levar
os hosts de um computador a outro; falta o app rodar do outro lado.

Esta feature entrega o mesmo OpenHost no Linux e no macOS, com as mesmas funções e o mesmo
visual, adaptando só o que é próprio de cada sistema: onde o cofre fica guardado, quais
terminais locais existem, como o agente SSH é encontrado, a tecla dos atalhos e a barra de
título. Ela também entrega os instaladores dos três sistemas na mesma versão 0.4.0.

Decisões já tomadas pelo usuário: macOS sem assinatura da Apple nesta versão; Linux em
AppImage, `.deb` e `.rpm`; Windows, Linux e macOS saem juntos na 0.4.0.

Os requisitos usam a faixa FR-401 em diante e SC-401 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Usar o OpenHost no Linux (Priority: P1)

Uma analista de NOC usa Ubuntu na estação de trabalho. Ela baixa o OpenHost, instala pelo
pacote da sua distribuição (ou roda o AppImage), cria o cofre, cadastra hosts e se conecta por
SSH, abre o SFTP, ativa encaminhamentos e abre um terminal local com o shell dela, tudo como no
Windows.

**Why this priority**: o Linux é o sistema mais comum entre quem administra servidores e é o
caminho com menos barreiras de distribuição (sem assinatura obrigatória).

**Independent Test**: instalar o `.deb` num Ubuntu limpo, criar o cofre, cadastrar um host do
servidor de testes, conectar por senha e por chave, transferir um arquivo por SFTP, ativar um
encaminhamento local, abrir um terminal local com `bash` e outro com `zsh`, fechar e reabrir o
app e desbloquear o cofre.

**Acceptance Scenarios**:

1. **Given** um Ubuntu 22.04 ou mais novo sem o OpenHost, **When** o usuário instala o `.deb`
   e abre o app pelo menu de aplicativos, **Then** a tela de criar o cofre aparece com o mesmo
   visual do Windows (preto piano com destaque laranja) e o ícone do app aparece no menu e na
   barra de tarefas.
2. **Given** o app aberto e o cofre criado, **When** o usuário cadastra um host e conecta,
   **Then** a confirmação da chave do servidor, o terminal, o SFTP e o encaminhamento de portas
   funcionam como no Windows.
3. **Given** `bash`, `zsh` e `fish` instalados, **When** o usuário abre "Novo terminal local",
   **Then** a lista mostra só os shells presentes, com o shell de login do usuário como padrão,
   e o terminal aberto aceita comandos interativos (cores, redimensionamento, Ctrl+C).
4. **Given** um agente SSH em execução com uma chave carregada (`SSH_AUTH_SOCK` definido),
   **When** o usuário conecta a um host com autenticação "Agente SSH", **Then** a conexão usa a
   chave do agente sem pedir senha.
5. **Given** um Fedora ou openSUSE, **When** o usuário instala o `.rpm`, **Then** o app abre e
   funciona como no cenário 1; **Given** outra distribuição, **When** ele roda o AppImage,
   **Then** o app abre sem instalação.

---

### User Story 2 - Usar o OpenHost no macOS (Priority: P2)

Um engenheiro de redes usa um MacBook com Apple Silicon. Ele baixa o `.dmg`, arrasta o app para
Aplicativos, segue a instrução para abrir um app sem assinatura na primeira vez e passa a usar o
OpenHost com os atalhos do Mac (Cmd em vez de Ctrl) e os botões de janela nativos.

**Why this priority**: é o segundo sistema mais pedido; vem depois do Linux porque a falta de
assinatura acrescenta um passo na primeira abertura.

**Independent Test**: num Mac com Apple Silicon e noutro com Intel, montar o `.dmg`, copiar o
app, abrir pela primeira vez seguindo a instrução, criar o cofre, conectar a um host, usar
Cmd+T, Cmd+W, Cmd+C/Cmd+V no terminal e fechar o app com Cmd+Q.

**Acceptance Scenarios**:

1. **Given** um Mac com Apple Silicon ou Intel, **When** o usuário abre o `.dmg`, **Then** vê o
   app e um atalho para Aplicativos, e uma instrução curta de como abrir o app na primeira vez.
2. **Given** o app copiado para Aplicativos e bloqueado pelo aviso de desenvolvedor não
   identificado, **When** o usuário segue a instrução publicada, **Then** o app abre e as
   aberturas seguintes não pedem nada.
3. **Given** o app aberto, **When** o usuário olha a janela, **Then** os botões de fechar,
   minimizar e tela cheia são os nativos do macOS, no canto esquerdo, e a área de arrasto e o
   título continuam funcionando.
4. **Given** o app aberto, **When** o usuário usa os atalhos do app (nova aba, fechar aba,
   paleta de comandos, configurações, bloquear cofre), **Then** eles funcionam com Cmd no lugar
   de Ctrl, os menus e as dicas mostram os símbolos do Mac (⌘, ⇧, ⌥), e Ctrl+C, Ctrl+D e outras
   teclas com Ctrl continuam indo para o terminal.
5. **Given** o terminal aberto, **When** o usuário seleciona texto e usa Cmd+C e depois Cmd+V,
   **Then** o texto é copiado e colado (com a mesma confirmação de colagem com várias linhas).
6. **Given** zsh (padrão do macOS) e bash, **When** o usuário abre um terminal local, **Then**
   o shell de login é o padrão e o terminal carrega o ambiente do usuário (PATH, aliases).

---

### User Story 3 - Levar os hosts de um sistema para outro (Priority: P2)

O usuário já usa o OpenHost no Windows e instala no Mac ou no Linux. Ele exporta o arquivo do
OpenHost no Windows (com chaves, protegido por senha), importa no outro sistema e continua
trabalhando com os mesmos grupos, hosts, chaves e regras de encaminhamento.

**Why this priority**: é o motivo principal de ter o app nos três sistemas; depende da 003, que
já entrega o formato.

**Independent Test**: exportar `.openhost` com chaves no Windows, importar no Linux e no macOS,
conferir a árvore de grupos e conectar por uma chave importada; repetir no sentido inverso.

**Acceptance Scenarios**:

1. **Given** um `.openhost` com chaves gerado no Windows, **When** o usuário o importa no Linux
   ou no macOS com a senha do arquivo, **Then** grupos, hosts, chaves, perfis por host e regras
   de encaminhamento chegam iguais e a conexão pela chave funciona.
2. **Given** um `.openhost` gerado no Linux ou no macOS, **When** é importado no Windows,
   **Then** o resultado é o mesmo do cenário 1.
3. **Given** o Linux ou o macOS, **When** o usuário abre "Importar e exportar", **Then** as
   origens do registro do Windows (PuTTY e KiTTY instalados) não aparecem, e as demais
   (OpenSSH, KiTTY portátil, CSV, MobaXterm, SecureCRT, OpenHost) aparecem e funcionam; a
   origem OpenSSH lê o `~/.ssh/config` do usuário daquele sistema.
4. **Given** o Linux ou o macOS, **When** o usuário exporta para "Acrescentar ao
   `~/.ssh/config`", **Then** o comportamento é o mesmo do Windows (cópia de segurança e
   trecho entre marcadores), e o arquivo continua legível pelo `ssh` do sistema.

---

### User Story 4 - Baixar a versão certa para cada sistema (Priority: P3)

Quem visita a página de releases encontra, na versão 0.4.0, o instalador do Windows, o `.dmg`
do macOS e os pacotes do Linux, com nomes claros e notas que dizem qual baixar e como abrir no
macOS na primeira vez.

**Why this priority**: sem a distribuição, as histórias anteriores não chegam ao usuário; vem
por último porque depende de todas elas estarem prontas.

**Independent Test**: publicar a 0.4.0 pelo workflow de release a partir da tag e conferir que
a página traz um arquivo por sistema e formato, que cada um instala e abre, e que as notas
explicam a primeira abertura no macOS.

**Acceptance Scenarios**:

1. **Given** a tag `v0.4.0`, **When** o workflow de release termina, **Then** a página da
   release tem o instalador do Windows, o `.dmg` do macOS (um arquivo que roda em Intel e Apple
   Silicon, ou um por arquitetura, com o nome dizendo qual), o AppImage, o `.deb` e o `.rpm`.
2. **Given** a página da release, **When** o usuário lê as notas, **Then** encontra qual
   arquivo baixar para cada sistema, as versões mínimas suportadas e o passo a passo da
   primeira abertura no macOS.
3. **Given** um pull request, **When** a integração contínua roda, **Then** o app é compilado
   e os testes automáticos rodam no Windows, no Linux e no macOS, e o pull request não pode ser
   mesclado com falha em qualquer um deles.

---

### Edge Cases

- **Linux sem a biblioteca de navegador embutido exigida**: o `.deb` e o `.rpm` declaram a
  dependência e o gerenciador de pacotes a instala; o AppImage, se ela faltar, mostra uma
  mensagem dizendo o pacote a instalar em vez de fechar sem aviso.
- **Linux com Wayland ou X11**: o app abre e funciona nos dois; arrastar, redimensionar,
  maximizar e as notificações seguem o gerenciador de janelas.
- **Escala de tela (HiDPI, 125%, 200%) e dois monitores com escalas diferentes**: textos e o
  terminal ficam nítidos e o terminal recalcula linhas e colunas ao mudar de monitor.
- **Shell padrão inexistente** (shell configurado foi desinstalado): o app volta ao shell de
  login do usuário e avisa, como já faz no Windows.
- **`SSH_AUTH_SOCK` ausente ou apontando para um socket morto**: a conexão com "Agente SSH"
  falha com a mesma mensagem clara do Windows ("agente SSH indisponível"), sem travar.
- **App aberto duas vezes**: a segunda abertura traz a janela existente para a frente, como no
  Windows; no macOS, clicar no ícone do Dock com a janela fechada reabre a janela.
- **Fechar a janela no macOS com sessões abertas**: a mesma confirmação de fechar com sessões
  ativas do Windows; Cmd+Q também pede a confirmação.
- **Cofre de outro sistema copiado à mão** (pasta de dados copiada do Windows): o cofre abre
  normalmente com a senha mestra, porque o formato não depende do sistema; o caminho
  recomendado continua sendo exportar e importar.
- **Arquivos e pastas com acentos e espaços** (SFTP, importação, chaves): funcionam igual nos
  três sistemas.
- **Permissões de arquivos do cofre**: no Linux e no macOS, o diretório de dados e os arquivos
  do cofre só podem ser lidos pelo próprio usuário.
- **Atualização de versão**: instalar a 0.4.0 por cima de uma versão anterior (no Linux, com
  o gerenciador de pacotes) mantém o cofre; desinstalar o app não apaga o cofre.
- **Mac com Apple Silicon sem Rosetta**: o app roda nativamente, sem pedir a instalação do
  Rosetta.

## Requirements *(mandatory)*

### Functional Requirements

**Funções iguais nos três sistemas**

- **FR-401**: O app MUST oferecer no Linux e no macOS todas as funções que oferece no Windows:
  cofre criptografado com senha mestra, hosts e grupos, credenciais e chaves, conexão SSH com
  confirmação de chave do servidor, terminal, SFTP, encaminhamento de portas, perfis e esquemas
  de cores, paleta de comandos, configurações e importar e exportar, com o mesmo visual e os
  mesmos textos em pt-BR.
- **FR-402**: O cofre MUST ficar no diretório de dados padrão de cada sistema (no Linux, a
  pasta de configuração do usuário seguindo a convenção XDG; no macOS, a pasta de suporte de
  aplicativos do usuário), e o formato do cofre MUST ser o mesmo nos três sistemas. A variável
  de ambiente que hoje redireciona o diretório de dados para testes MUST continuar valendo.
- **FR-403**: No Linux e no macOS, o diretório de dados MUST ser criado com acesso só para o
  próprio usuário, e os arquivos do cofre também.
- **FR-404**: As regras de segredo já existentes (nada de senha, passphrase ou chave privada em
  texto legível no diretório de dados, nos logs ou na memória além do necessário, e nenhum
  preenchimento automático ou memória de senhas pelo navegador embutido) MUST valer nos três
  sistemas e MUST ser verificadas por teste em cada um.

**Terminal local e agente SSH**

- **FR-405**: No Linux e no macOS, o terminal local MUST abrir um pseudoterminal real com o
  shell escolhido, como shell de login (carregando o ambiente do usuário), com suporte a cores,
  redimensionamento e sinais (Ctrl+C, Ctrl+Z, Ctrl+D).
- **FR-406**: A lista de shells locais no Linux e no macOS MUST mostrar só os shells presentes
  na máquina entre os declarados pelo sistema (incluindo bash, zsh, fish e sh quando
  existirem), com o shell de login do usuário como padrão. As opções exclusivas do Windows
  (PowerShell, Prompt de Comando, Git Bash, WSL) não aparecem fora dele.
- **FR-407**: No Linux e no macOS, a autenticação "Agente SSH" MUST usar o agente indicado por
  `SSH_AUTH_SOCK`; sem ele, a conexão MUST falhar com a mensagem de agente indisponível.

**Janela, teclado e aparência**

- **FR-408**: No macOS, a janela MUST usar os botões nativos de fechar, minimizar e tela
  cheia, no canto esquerdo, mantendo a área de arrasto e o restante do cabeçalho do app; no
  Linux, a janela MUST ter botões de fechar, minimizar e maximizar funcionais e respeitar o
  gerenciador de janelas (arrastar, maximizar por duplo clique, encaixe).
- **FR-409**: No macOS, os atalhos do app MUST usar Cmd no lugar de Ctrl, e as dicas, menus e a
  página de atalhos MUST mostrar os símbolos do Mac; no terminal, Cmd+C e Cmd+V copiam e colam,
  e as combinações com Ctrl continuam indo para o programa remoto ou local.
- **FR-410**: No macOS, o app MUST ter o menu da aplicação padrão (Sobre, Configurações com
  Cmd+vírgula, Ocultar, Sair com Cmd+Q) e os menus de edição que permitem copiar e colar nos
  campos de texto.
- **FR-411**: As preferências do sistema que o app já segue no Windows MUST ser seguidas nos
  outros dois onde o sistema as fornece: tema claro ou escuro, reduzir movimento e cor de
  destaque; onde o sistema não fornece a cor de destaque, a opção "seguir o sistema" usa a cor
  da marca.
- **FR-412**: Efeitos visuais que só existem no Windows (transparência do fundo da janela)
  MUST ter um equivalente nativo onde o sistema oferece (macOS) ou um fundo sólido com o mesmo
  visual da marca onde não oferece (Linux), sem perda de contraste.
- **FR-413**: Abrir o app uma segunda vez MUST trazer a janela existente para a frente nos três
  sistemas; no macOS, clicar no ícone do Dock com a janela fechada MUST reabrir a janela.
- **FR-414**: Fechar o app com sessões ativas MUST pedir a mesma confirmação nos três sistemas,
  inclusive por Cmd+Q no macOS.

**Importar e exportar**

- **FR-415**: As origens de importação que leem o registro do Windows (PuTTY e KiTTY
  instalados) MUST ficar indisponíveis no Linux e no macOS; KiTTY portátil, OpenSSH, CSV,
  MobaXterm, SecureCRT e OpenHost MUST funcionar nos três, e a origem OpenSSH MUST ler por
  padrão o `~/.ssh/config` do usuário de cada sistema.
- **FR-416**: Um arquivo `.openhost` gerado em qualquer um dos três sistemas MUST ser
  importado nos outros dois com o mesmo resultado, com e sem chaves.

**Distribuição e qualidade**

- **FR-417**: A versão 0.4.0 MUST publicar, pelo workflow de release a partir da tag:
  instalador do Windows (como hoje); `.dmg` do macOS para Intel e Apple Silicon, sem
  assinatura da Apple; AppImage, `.deb` e `.rpm` do Linux para amd64 (arm64 quando o build da
  plataforma permitir, sem bloquear a release).
- **FR-418**: O `.dmg` MUST mostrar o app e um atalho para Aplicativos; as notas da release e o
  README MUST explicar como abrir um app sem assinatura na primeira vez, incluindo o caminho
  pelas configurações de Privacidade e Segurança das versões recentes do macOS.
- **FR-419**: O `.deb` e o `.rpm` MUST declarar as dependências de sistema, instalar o atalho
  no menu de aplicativos com o ícone do app e poder ser removidos pelo gerenciador de pacotes
  sem apagar o cofre; o AppImage MUST rodar sem instalação.
- **FR-420**: O nome visível do app MUST ser "OpenHost" em todos os sistemas (menu, Dock, barra
  de tarefas, gerenciador de pacotes), com o ícone da marca em cada um.
- **FR-421**: A integração contínua MUST compilar o app e rodar os testes automáticos no
  Windows, no Linux e no macOS a cada pull request, e a release MUST falhar se algum dos
  instaladores não for gerado.
- **FR-422**: Em cada sistema, um teste automático MUST abrir o app compilado, confirmar que a
  janela carrega a tela inicial e fechá-lo, para detectar build que compila mas não abre.

### Key Entities

- **Plataforma**: Windows, Linux ou macOS; determina o diretório de dados, os shells locais
  disponíveis, o agente SSH, a tecla dos atalhos, a barra de título e as origens de importação
  disponíveis.
- **Shell local**: programa de terminal local presente na máquina; tem identificador estável,
  nome exibido e indicação de qual é o padrão. O conjunto disponível depende da plataforma.
- **Artefato de release**: arquivo publicado numa versão; tem sistema, arquitetura, formato
  (instalador do Windows, `.dmg`, AppImage, `.deb`, `.rpm`) e nome que deixa claro para quem é.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-401**: Num Ubuntu LTS, num Fedora e num macOS (Intel e Apple Silicon) limpos, um usuário
  instala o app, cria o cofre, cadastra um host e conecta em até 5 minutos, sem instalar nada
  além do que o instalador pede.
- **SC-402**: O roteiro de validação da 002 (conectar por senha, chave e agente; SFTP com
  arquivo de 100 MB; encaminhamento local; terminal local; perfis) passa por completo no Linux e
  no macOS, sem diferença de resultado em relação ao Windows.
- **SC-403**: Um `.openhost` com 200 hosts e 10 chaves gerado em cada sistema é importado nos
  outros dois com 100% dos hosts, grupos e chaves e com conexão bem-sucedida pela chave.
- **SC-404**: 100% dos atalhos da página de atalhos funcionam no macOS com Cmd e mostram os
  símbolos do Mac; nenhuma combinação com Ctrl destinada ao terminal é capturada pelo app.
- **SC-405**: A varredura de segredos (senha mestra, senha de host, passphrase e trechos de
  chave em texto, UTF-16 e base64) encontra zero ocorrências no diretório de dados depois do
  fluxo completo, no Linux e no macOS.
- **SC-406**: Cada instalador do Linux e do macOS tem até 40 MB, e o app ocioso com uma aba
  aberta usa até 250 MB de memória nesses sistemas.
- **SC-407**: A release 0.4.0 publica os 5 formatos (Windows, macOS, AppImage, `.deb`, `.rpm`)
  numa única execução do workflow, e cada um instala e abre na primeira tentativa em máquina
  limpa.
- **SC-408**: A integração contínua termina em até 30 minutos com os três sistemas, e falha em
  qualquer um deles bloqueia o merge.

## Assumptions

- **Versões mínimas**: macOS 12 (Monterey) ou mais novo; Linux com a biblioteca de navegador
  embutido disponível nos repositórios oficiais, cobrindo Ubuntu 22.04+, Debian 12+, Fedora 39+
  e openSUSE Leap 15.5+. Versões mais antigas podem funcionar, mas não são testadas.
- **Assinatura**: o macOS sai sem assinatura nem notarização da Apple nesta versão (decisão do
  usuário); o Linux sai sem assinatura de pacote e sem repositório próprio (o usuário baixa da
  página de releases). Assinatura e repositórios podem vir depois.
- **Arquiteturas**: Windows e Linux em amd64; macOS em Intel e Apple Silicon; Linux arm64 é
  desejável, mas não bloqueia a 0.4.0.
- **Atualização automática**: continua fora do escopo; o usuário baixa a versão nova da página
  de releases, como hoje no Windows.
- **Testes de interface ponta a ponta**: os testes que dirigem a interface pelo protocolo de
  depuração do navegador embutido do Windows continuam só no Windows; no Linux e no macOS a
  cobertura vem dos testes automáticos do núcleo e da interface, do teste de abertura do app
  (FR-422) e do roteiro de validação manual (SC-402).
- **Cofre e formato**: o cofre e o `.openhost` já são independentes de sistema; não há
  migração de dados nesta feature.
- **Nome interno**: o diretório de dados continua usando o nome interno `ShellVault` em todos
  os sistemas, para manter o padrão do Windows; o nome visível é "OpenHost".
- **Constituição**: a constituição define o Windows como "plataforma alvo inicial"; o plano
  desta feature propõe a emenda que inclui Linux e macOS como alvos suportados.
- **Dependência**: a 0.4.0 inclui a 003 (importar e exportar); esta feature reusa o formato
  `.openhost` e a tela de importação dela.

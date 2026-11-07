# Feature Specification: Ícones e detecção de fabricantes de equipamentos de rede

**Feature Branch**: `005-network-vendors`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Ícones e detecção automática de fabricantes de equipamentos de rede no OpenHost. Hoje o avatar do host mostra o logo do sistema (Linux, Windows, macOS etc.) e de alguns fabricantes (Cisco, Huawei, Juniper, Fortinet, MikroTik, HPE), detectados só pelo banner SSH (identificação do servidor) ou escolhidos à mão; os logos já aparecem na cor oficial da marca sobre um quadrado de cor única. Problemas: (1) faltam ZTE, Datacom e Hillstone, que não existem no Simple Icons — o usuário não tem os logos oficiais, então serão ícones simplificados desenhados pelo projeto, monocromáticos no traço e pintados na cor da marca; (2) a detecção falha na maioria dos equipamentos de rede, porque muitos se identificam como OpenSSH genérico (Juniper/Junos, Datacom/DmOS) ou escondem o banner (FortiGate recente); (3) para esses OpenSSH genéricos o app tenta ler /etc/os-release por um canal separado, o que em equipamento de rede atrasa a abertura do terminal em até 3 s. Objetivo: reconhecer o fabricante também pela mensagem pré-login (banner de autenticação do SSH) e pelas primeiras linhas que o equipamento mostra no terminal após conectar (ex.: "Huawei Versatile Routing Platform", "ZXR10"/"ZXAN" da ZTE, "DmOS"/"DATACOM", "JUNOS", "Hillstone"/"StoneOS", prompt do FortiGate, "Cisco IOS"), só localmente, sem gravar nem enviar o conteúdo; o fabricante reconhecido vira o ícone do host em "Automático", e a escolha manual continua prevalecendo. A leitura de /etc/os-release não pode atrasar a abertura do terminal. Fabricantes cobertos: Huawei, ZTE, Datacom, Cisco, Juniper, Hillstone, Fortinet, MikroTik (além dos já existentes). Decisão do usuário: sem logos oficiais para ZTE, Datacom e Hillstone — usar ícones próprios simplificados na cor da marca."

## Contexto

Quem administra rede acessa dezenas de roteadores, switches, OLTs e firewalls de fabricantes
diferentes. A lista de hosts fica mais fácil de ler quando cada um mostra o logo do
fabricante, sem o usuário precisar escolher o ícone de cada host à mão.

A 002 (FR-178) trouxe o logo do sistema no avatar do host, detectado pela identificação que o
servidor SSH anuncia ao conectar e, em servidores Linux genéricos, por uma leitura do arquivo de
identificação da distribuição. Isso funciona bem para servidores, mas pouco para equipamentos
de rede: vários se anunciam como um servidor SSH genérico ou escondem a identificação, e três
fabricantes comuns no Brasil (ZTE, Datacom e Hillstone) nem têm ícone. Em equipamentos que se
anunciam como genéricos, a tentativa de ler o arquivo da distribuição ainda atrasa a abertura
do terminal em até 3 segundos.

Já entregue antes desta spec, como ajuste visual (ver FR-501): o quadrado do avatar passou a
ter uma cor única para todos os hosts, e os logos aparecem na cor oficial de cada marca.

Os requisitos usam a faixa FR-501 em diante e SC-501 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver o fabricante de cada equipamento na lista de hosts (Priority: P1)

Um analista de NOC tem hosts cadastrados de Huawei, ZTE, Datacom, Cisco, Juniper, Hillstone,
Fortinet e MikroTik, todos com o ícone em "Automático". Ele se conecta a cada um uma vez; a
partir daí, a lista de hosts mostra o logo do fabricante de cada equipamento na cor da marca,
sem ele ter escolhido nada.

**Why this priority**: é o pedido central: identificar de relance o tipo de equipamento na
lista. Sem detecção, o usuário teria que escolher o ícone de cada host à mão.

**Independent Test**: conectar uma vez a um equipamento (ou simulador) de cada um dos oito
fabricantes, com o ícone em "Automático", e conferir o logo de cada um na lista.

**Acceptance Scenarios**:

1. **Given** um host Juniper que se anuncia como servidor SSH genérico e mostra o texto de
   boas-vindas do Junos no terminal, **When** o usuário conecta, **Then** o avatar passa a
   mostrar o logo da Juniper.
2. **Given** um host Huawei, **When** o usuário conecta, **Then** o avatar mostra o logo da
   Huawei, pela identificação do servidor ou pelo texto do equipamento no terminal.
3. **Given** uma OLT ou roteador ZTE que mostra "ZXR10" ou "ZXAN" no login ou no terminal,
   **When** o usuário conecta, **Then** o avatar mostra o ícone da ZTE.
4. **Given** um switch Datacom que mostra "DmOS" ou "DATACOM" no login ou no terminal, **When**
   o usuário conecta, **Then** o avatar mostra o ícone da Datacom.
5. **Given** um firewall Hillstone que mostra "Hillstone" ou "StoneOS", **When** o usuário
   conecta, **Then** o avatar mostra o ícone da Hillstone.
6. **Given** um FortiGate que esconde a identificação do servidor SSH, **When** o usuário
   conecta e o equipamento mostra o prompt típico do FortiGate, **Then** o avatar mostra o logo
   da Fortinet.
7. **Given** um host com ícone escolhido à mão (ex.: "Cisco"), **When** o usuário conecta e o
   app reconhece outro fabricante, **Then** o avatar continua com o ícone escolhido; o
   fabricante reconhecido aparece no formulário do host como sugestão do "Automático".

---

### User Story 2 - Terminal abre sem espera em equipamento de rede (Priority: P1)

O mesmo analista abre uma sessão num Juniper ou num Datacom, que se anunciam como servidor SSH
genérico. Hoje o terminal demora até 3 segundos para aparecer, enquanto o app tenta descobrir a
distribuição Linux. Depois desta feature, o terminal abre tão rápido quanto num equipamento que
se identifica.

**Why this priority**: o atraso é sentido em toda conexão, não só na primeira; em quem abre
muitas sessões por turno, ele pesa mais que o ícone.

**Independent Test**: medir o tempo entre conectar e o terminal aceitar digitação num
equipamento que se anuncia como genérico e não tem o arquivo da distribuição, antes e depois.

**Acceptance Scenarios**:

1. **Given** um equipamento que se anuncia como servidor SSH genérico, **When** o usuário
   conecta, **Then** o terminal aparece e aceita digitação sem esperar pela descoberta do
   sistema.
2. **Given** um host já reconhecido antes como equipamento de rede, **When** o usuário conecta
   de novo, **Then** o app não abre nenhum canal extra nem envia nenhum comando ao equipamento.
3. **Given** um servidor Linux que se anuncia como genérico, **When** o usuário conecta,
   **Then** a distribuição continua sendo reconhecida (ex.: Ubuntu, Debian, Rocky) como hoje,
   sem atrasar o terminal.

---

### User Story 3 - Escolher à mão os novos fabricantes (Priority: P2)

Uma engenheira cadastra uma OLT ZTE que nunca foi acessada. Ela abre o formulário do host,
escolhe "ZTE" no seletor de ícone e o avatar já mostra o ícone, antes da primeira conexão.

**Why this priority**: cobre hosts ainda não acessados e os casos em que a detecção não
reconhece o equipamento; depende só dos novos ícones existirem.

**Independent Test**: escolher ZTE, Datacom e Hillstone no seletor de ícone de três hosts e
conferir o avatar na lista e no próprio seletor.

**Acceptance Scenarios**:

1. **Given** o formulário do host, **When** a usuária abre o seletor de ícone, **Then** ZTE,
   Datacom e Hillstone aparecem na lista em ordem alfabética, cada um com seu ícone.
2. **Given** um host com ícone ZTE, Datacom ou Hillstone, **When** a usuária vê a lista de
   hosts, **Then** o ícone aparece na cor da marca sobre o quadrado do avatar, legível no tema
   escuro e no claro.
3. **Given** um host com ícone escolhido à mão, **When** a usuária volta para "Automático",
   **Then** o avatar mostra o fabricante detectado, ou as iniciais se nenhum foi detectado.

---

### Edge Cases

- **Servidor Linux cuja mensagem de boas-vindas cita um fabricante** (ex.: "Lab Cisco" no
  texto do servidor de salto): quando a distribuição Linux é reconhecida, ela prevalece sobre o
  texto do terminal; o texto só conta quando corresponde a uma assinatura específica do sistema
  do equipamento, não à simples menção do nome.
- **Sinais conflitantes** (identificação do servidor diz um fabricante e o texto do terminal
  outro): vale a fonte mais confiável, nesta ordem: identificação do servidor, mensagem
  pré-login, texto do terminal, arquivo da distribuição.
- **Nada reconhecido nesta conexão**: o fabricante detectado antes continua valendo; uma
  conexão sem reconhecimento nunca apaga a detecção anterior.
- **Equipamento trocado no mesmo endereço** (ex.: um Cisco substituído por um Huawei): a
  próxima conexão com reconhecimento troca o ícone em "Automático".
- **Sessão que cai antes de mostrar qualquer texto** ou equipamento que só mostra o prompt
  depois de um Enter: sem reconhecimento nesta conexão; nada muda e nenhuma tecla é enviada
  pelo app.
- **Muito texto logo após conectar** (ex.: equipamento que despeja um log): o app olha só um
  trecho inicial limitado da saída e para; nenhum atraso perceptível no terminal.
- **Texto com cores, códigos de controle ou quebras de linha do equipamento**: o
  reconhecimento ignora códigos de controle e diferenças de maiúsculas.
- **Sessão SFTP e encaminhamento de portas sem terminal**: não há texto de terminal; vale só a
  identificação do servidor e a mensagem pré-login.
- **Cofre bloqueado durante a conexão**: o fabricante reconhecido não é gravado; nada se perde
  além da atualização do ícone naquela conexão.
- **Fabricante fora da lista**: o host continua com as iniciais (ou com o ícone genérico de
  rede, se for reconhecido só como equipamento de rede sem fabricante conhecido).

## Requirements *(mandatory)*

### Functional Requirements

**Visual do avatar (já entregue)**

- **FR-501**: O quadrado do avatar MUST ter a mesma cor para todos os hosts, e o logo do
  sistema ou fabricante MUST aparecer na cor oficial da marca. Quando a cor oficial não se
  destaca do quadrado num tema (ex.: logo preto no tema escuro, amarelo no tema claro), o logo
  MUST usar a cor do texto naquele tema. No modo de alto contraste, vale a cor do sistema.

**Novos fabricantes**

- **FR-502**: O app MUST ter ícones para ZTE, Datacom e Hillstone, desenhados pelo projeto de
  forma simplificada (sem reproduzir os logos oficiais), no mesmo estilo de traço dos demais e
  pintados com a cor predominante da marca, seguindo FR-501.
- **FR-503**: ZTE, Datacom e Hillstone MUST aparecer no seletor de ícone do formulário do host,
  em ordem alfabética com os demais, e MUST poder ser detectados (FR-505 a FR-507).
- **FR-504**: Os fabricantes cobertos pela detecção MUST incluir pelo menos Huawei, ZTE,
  Datacom, Cisco, Juniper, Hillstone, Fortinet e MikroTik, além dos sistemas e fabricantes já
  reconhecidos hoje.

**Detecção**

- **FR-505**: Além da identificação que o servidor SSH anuncia, o app MUST reconhecer o
  fabricante pela mensagem que o servidor mostra antes do login, quando houver.
- **FR-506**: Em sessões de terminal, o app MUST reconhecer o fabricante pelo trecho inicial do
  texto que o equipamento mostra após conectar, procurando assinaturas próprias do sistema de
  cada fabricante (ex.: "Huawei Versatile Routing Platform", "ZXR10"/"ZXAN", "DmOS", "JUNOS",
  "StoneOS", o prompt do FortiGate, "Cisco IOS"). O trecho examinado MUST ser limitado em
  tamanho e em tempo após a abertura da sessão.
- **FR-507**: Quando houver sinais diferentes, o app MUST seguir esta ordem de confiança:
  identificação do servidor SSH, mensagem pré-login, texto do terminal, arquivo de
  identificação da distribuição. Uma distribuição Linux reconhecida pelo arquivo MUST
  prevalecer sobre o texto do terminal.
- **FR-508**: O texto examinado (mensagem pré-login e saída do terminal) MUST ser usado só em
  memória para o reconhecimento: não pode ser gravado no cofre, em logs ou em disco, nem
  enviado para fora do computador. Só o identificador do fabricante reconhecido é guardado.
- **FR-509**: A detecção MUST NOT enviar teclas, comandos ou caracteres ao terminal do usuário,
  e MUST NOT alterar nada do que aparece nele.
- **FR-510**: Uma conexão sem reconhecimento MUST NOT apagar o fabricante detectado antes; uma
  conexão com reconhecimento diferente MUST substituí-lo.
- **FR-511**: Como hoje (FR-178), o ícone escolhido à mão MUST prevalecer sobre o detectado; em
  "Automático", o avatar MUST mostrar o detectado, e o formulário do host MUST indicar qual
  fabricante foi detectado.

**Tempo de abertura**

- **FR-512**: A descoberta do sistema MUST NOT atrasar a abertura do terminal: o terminal MUST
  aparecer e aceitar digitação sem esperar por ela, inclusive em servidores que se anunciam
  como genéricos.
- **FR-513**: Hosts já reconhecidos como equipamento de rede MUST NOT receber o canal extra de
  leitura do arquivo da distribuição. Equipamentos de rede continuam sem receber comandos
  (FR-178).

### Key Entities

- **Host**: como na 002, com o "sistema detectado" agora podendo ser também ZTE, Datacom ou
  Hillstone, e o "ícone escolhido" aceitando os três.
- **Assinatura de fabricante**: trecho de texto característico de um fabricante e a fonte onde
  ele vale (identificação do servidor, mensagem pré-login ou texto do terminal); conjunto fixo
  embutido no app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-501**: Num conjunto de amostras de login de equipamentos dos oito fabricantes (pelo
  menos três amostras por fabricante, cobrindo modelos e versões diferentes), o fabricante
  correto é reconhecido em pelo menos 90% das amostras após uma conexão.
- **SC-502**: Num conjunto de amostras de servidores Linux, Windows e macOS, incluindo
  mensagens de boas-vindas que citam fabricantes, nenhum servidor é reconhecido como
  equipamento de rede (zero falsos positivos).
- **SC-503**: Em equipamentos que se anunciam como servidor SSH genérico, o terminal passa a
  aceitar digitação no mesmo tempo (diferença menor que 0,2 s) que em equipamentos que se
  identificam, contra até 3 s antes.
- **SC-504**: Nenhuma tecla, comando ou byte é enviado ao terminal pela detecção, verificado em
  todas as amostras de SC-501 e SC-502.
- **SC-505**: Os nove logos de fabricantes de rede (os oito pedidos mais HPE) são
  distinguíveis entre si no tamanho do avatar da lista, nos temas escuro e claro.

## Assumptions

- As amostras de login usadas nos testes vêm de documentação pública dos fabricantes e de
  capturas reais fornecidas pelo usuário, sempre sem endereços, nomes de host ou senhas.
- A cor predominante de ZTE, Datacom e Hillstone é tirada do material público de cada marca;
  os ícones simplificados não copiam os logos e servem só para identificar o fabricante, como
  os demais.
- "Trecho inicial" do terminal significa alguns kilobytes ou alguns segundos após a abertura, o
  que vier primeiro; o valor exato fica para o plano.
- Equipamentos que só mostram o texto do sistema depois de um comando (ex.: exigem `display
  version`) não são reconhecidos automaticamente; para eles, vale a escolha manual.
- Fabricantes além dos oito pedidos (ex.: Nokia, Ubiquiti, TP-Link, Intelbras) ficam fora
  desta feature; podem entrar depois com o mesmo mecanismo.
- A feature sai numa versão posterior à 0.4.0.

# Feature Specification: Atualização pelo próprio app, com aviso de versão nova

**Feature Branch**: `007-in-app-update`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Atualização pelo próprio app com notificação (OpenHost). O app confere se há versão nova publicada nas releases do GitHub do projeto ao abrir e periodicamente (a cada algumas horas); quando há, mostra um aviso discreto com a versão e as novidades (notas da release); o usuário clica em "Atualizar", o app baixa o pacote certo para o sistema e formato instalado (Windows instalador, macOS dmg/app, Linux deb/rpm/AppImage), confere a integridade e autenticidade do arquivo antes de usar, instala e reinicia já na versão nova, preservando cofre, sessões e preferências. Pode adiar ("Lembrar depois") ou pular aquela versão. Por padrão só versões estáveis; nas Configurações uma opção ativa receber versões de teste (rc). Também deve haver "Procurar atualizações" manual nas Configurações e na paleta, e a opção de desligar a verificação automática. Se houver sessões abertas, avisar antes de reiniciar. Quando a instalação automática não for possível (ex.: pacote deb/rpm que exige permissão de administrador, ou sem permissão de escrita), oferecer baixar e abrir o instalador ou mostrar o comando. Nada além de consultar as releases e baixar o pacote sai do computador (sem telemetria). Decisões já tomadas pelo usuário: avisar e instalar com 1 clique; só estáveis por padrão com opção de receber as de teste."

## Contexto

Hoje o usuário só descobre uma versão nova do OpenHost se for à página de releases, baixar o
arquivo do sistema certo e reinstalar. Na prática, quase ninguém faz isso, e correções ficam sem
chegar a quem usa.

Esta feature faz o app avisar quando sai uma versão nova e se atualizar com um clique, sem perder
cofre, hosts, preferências nem as sessões que o usuário decide manter até reiniciar.

Decisões do usuário: avisar e instalar com um clique (não instalar escondido); só versões
estáveis por padrão, com opção nas Configurações para receber as de teste.

Os requisitos usam a faixa FR-701 em diante e SC-701 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber que há versão nova (Priority: P1)

O usuário abre o OpenHost. Se há uma versão estável mais nova que a instalada, aparece um aviso
discreto (sem bloquear o trabalho) com o número da versão e um resumo das novidades. Dali ele
pode ver as notas completas, atualizar, deixar para depois ou pular aquela versão.

**Why this priority**: sem o aviso, nenhuma outra parte chega ao usuário; sozinho já resolve o
problema de "não sei que saiu versão nova".

**Independent Test**: com uma versão mais nova publicada, abrir o app e ver o aviso com versão e
novidades; com a versão instalada igual à mais nova, nenhum aviso.

**Acceptance Scenarios**:

1. **Given** a versão instalada é a 0.5.0 e existe a 0.5.1 estável, **When** o app abre,
   **Then** em até alguns segundos aparece o aviso "Versão 0.5.1 disponível" com as novidades,
   sem interromper sessões nem roubar o foco do terminal.
2. **Given** o aviso está aberto, **When** o usuário escolhe "Lembrar depois", **Then** o aviso
   some e volta no próximo início do app ou na próxima verificação periódica, o que vier
   depois de pelo menos 24 horas.
3. **Given** o aviso está aberto, **When** o usuário escolhe "Pular esta versão", **Then** o
   aviso não aparece mais para a 0.5.1, mas volta a aparecer quando sair uma versão mais nova.
4. **Given** o app ficou aberto por horas, **When** sai uma versão nova nesse intervalo,
   **Then** o aviso aparece na próxima verificação periódica, sem reiniciar o app.
5. **Given** o computador está sem internet, **When** a verificação falha, **Then** nada é
   mostrado ao usuário (sem erro em tela), e a próxima verificação tenta de novo.

---

### User Story 2 - Atualizar com um clique (Priority: P1)

No aviso (ou nas Configurações), o usuário clica em "Atualizar". O app baixa o pacote do seu
sistema e formato de instalação, mostra o progresso, confere que o arquivo é o publicado pelo
projeto e, pronto para instalar, pede para reiniciar. Se há sessões abertas, avisa quantas
serão encerradas e deixa escolher "Reiniciar agora" ou "Ao fechar o app". Depois de reiniciar,
o app já está na versão nova, com o cofre, os hosts e as preferências intactos.

**Why this priority**: é o objetivo da feature; o aviso sem a instalação ainda obriga o usuário
a fazer tudo à mão.

**Independent Test**: com uma versão de teste publicada, clicar em "Atualizar", acompanhar o
download, reiniciar e conferir no "Sobre" a versão nova, com o cofre abrindo com a mesma senha.

**Acceptance Scenarios**:

1. **Given** existe versão nova e o app foi instalado pelo instalador do Windows, **When** o
   usuário clica em "Atualizar", **Then** o download mostra progresso, e ao terminar o botão
   vira "Reiniciar para atualizar".
2. **Given** o download terminou e há 3 sessões SSH abertas, **When** o usuário clica em
   "Reiniciar para atualizar", **Then** uma confirmação informa que 3 sessões serão encerradas,
   com "Reiniciar agora" e "Atualizar ao fechar".
3. **Given** o usuário escolheu "Atualizar ao fechar", **When** fecha o app, **Then** a
   atualização é aplicada e o próximo início já está na versão nova.
4. **Given** o arquivo baixado não confere com o publicado (corrompido ou adulterado),
   **When** a verificação roda, **Then** o arquivo é descartado, nada é instalado, e o
   usuário vê "Não foi possível confirmar a origem da atualização" com opção de tentar de novo.
5. **Given** a atualização foi aplicada, **When** o app reinicia, **Then** abre na versão nova,
   o cofre continua bloqueado esperando a mesma senha mestra, e hosts, grupos, chaves,
   encaminhamentos, perfis e preferências estão como antes.
6. **Given** a instalação falhou no meio, **When** o app é aberto de novo, **Then** ele abre na
   versão anterior, funcionando, e informa que a atualização não foi concluída.

---

### User Story 3 - Quando não dá para instalar sozinho (Priority: P2)

Em formatos de instalação que exigem permissão de administrador (pacotes do Linux instalados
pelo gerenciador do sistema) ou quando o app não pode gravar onde está instalado, o aviso
continua aparecendo, mas o botão oferece o caminho manual: baixar o pacote certo e abrir a pasta
ou o instalador, ou mostrar o comando para instalar, pronto para copiar.

**Why this priority**: sem isso, parte dos usuários de Linux veria um botão que não funciona.

**Independent Test**: num Linux com o app instalado por pacote do sistema, o aviso oferece
"Baixar" e o comando de instalação, e o arquivo baixado é o do formato instalado.

**Acceptance Scenarios**:

1. **Given** o app foi instalado por pacote `.deb`, **When** há versão nova, **Then** o aviso
   oferece "Baixar pacote" e mostra o comando de instalação para copiar, em vez de reiniciar
   sozinho.
2. **Given** o app roda como AppImage numa pasta em que o usuário pode gravar, **When** o
   usuário clica em "Atualizar", **Then** a atualização funciona com um clique, como no Windows.
3. **Given** o app não tem permissão para se substituir, **When** o usuário clica em
   "Atualizar", **Then** recebe o pacote baixado e a instrução de instalação, sem erro genérico.

---

### User Story 4 - Controlar as atualizações (Priority: P3)

Nas Configurações, o usuário vê a versão instalada, quando foi a última verificação e o botão
"Procurar atualizações". Pode desligar a verificação automática e ligar "Receber versões de
teste". "Procurar atualizações" também está na paleta de comandos.

**Why this priority**: conveniência e controle; o fluxo principal funciona com os padrões.

**Independent Test**: desligar a verificação automática e confirmar que o app não consulta
nada ao abrir; ligar as versões de teste e ver uma rc oferecida.

**Acceptance Scenarios**:

1. **Given** a verificação automática está desligada, **When** o app abre, **Then** nenhuma
   consulta de versão sai do computador.
2. **Given** "Receber versões de teste" está ligado e existe a 0.6.0-rc.1, **When** o app
   verifica, **Then** oferece a 0.6.0-rc.1, marcada como versão de teste.
3. **Given** o usuário está numa versão de teste e desliga "Receber versões de teste",
   **When** sai a versão estável correspondente, **Then** ela é oferecida normalmente.
4. **Given** o usuário clica em "Procurar atualizações" e já está na mais nova, **Then** vê
   "Você já está na versão mais recente" com o número da versão.

---

### Edge Cases

- A versão publicada não tem pacote para o sistema ou a arquitetura do usuário: não oferecer
  atualização (nem aviso) até haver pacote compatível.
- Download interrompido (rede caiu, app fechado): na próxima tentativa recomeça ou continua sem
  usar o arquivo parcial; nunca instala arquivo incompleto.
- Pouco espaço em disco: mensagem clara antes de começar a instalar, sem deixar o app quebrado.
- Duas janelas do app ou o app aberto duas vezes: só uma instância aplica a atualização.
- Cofre desbloqueado ao reiniciar: o cofre volta bloqueado (como em qualquer início); nada de
  senha ou chave fica guardado para "pular" o desbloqueio.
- Versão publicada mais antiga que a instalada (ex.: usuário numa rc mais nova): nunca oferece
  voltar de versão.
- Limite de consultas do serviço de releases atingido: trata como falha temporária e tenta mais
  tarde, sem mensagem em tela.
- Usuário em rede com proxy corporativo: usa as configurações de proxy do sistema.
- Atualização aplicada, mas o novo início falha: o usuário consegue reinstalar baixando a versão
  da página de releases, e o cofre continua legível.

## Requirements *(mandatory)*

### Functional Requirements

**Verificar**

- **FR-701**: O app MUST verificar se há versão mais nova ao iniciar (sem atrasar a abertura) e
  periodicamente enquanto aberto, no máximo a cada 6 horas, quando a verificação automática
  estiver ligada (padrão: ligada).
- **FR-702**: Por padrão, MUST considerar só versões estáveis; com "Receber versões de teste"
  ligado, MUST considerar também versões de teste. Nunca MUST oferecer versão igual ou mais
  antiga que a instalada.
- **FR-703**: MUST oferecer só versões que tenham pacote para o sistema, a arquitetura e o
  formato de instalação do usuário.
- **FR-704**: Falhas de verificação (sem rede, serviço fora do ar, limite de consultas) MUST
  ser silenciosas na verificação automática e explicadas na verificação manual.
- **FR-705**: A verificação MUST enviar apenas o necessário para consultar as versões
  publicadas e baixar o pacote; nenhum dado do usuário, do cofre, de hosts ou de uso sai do
  computador.

**Avisar**

- **FR-706**: Havendo versão nova, o app MUST mostrar um aviso não bloqueante com o número da
  versão, se é de teste, e as novidades (notas da versão), com as ações "Atualizar",
  "Lembrar depois" e "Pular esta versão". O aviso MUST NOT tirar o foco do terminal.
- **FR-707**: "Lembrar depois" MUST esconder o aviso por pelo menos 24 horas; "Pular esta
  versão" MUST esconder o aviso daquela versão até sair outra mais nova. As escolhas MUST
  persistir entre execuções.
- **FR-708**: Enquanto há atualização disponível ou pronta, MUST haver um indicador permanente
  e discreto (por exemplo, na barra de status) que reabre o aviso.

**Baixar e instalar**

- **FR-709**: "Atualizar" MUST baixar o pacote certo em segundo plano, com progresso visível e
  opção de cancelar, sem atrapalhar sessões abertas.
- **FR-710**: Antes de instalar, o app MUST confirmar que o arquivo é íntegro e foi publicado
  pelo projeto (assinatura verificável com uma chave embutida no app); se não confirmar,
  MUST descartar o arquivo e não instalar nada.
- **FR-711**: Com o pacote pronto, o app MUST pedir para reiniciar; havendo sessões abertas,
  MUST informar quantas serão encerradas e oferecer "Reiniciar agora" ou "Atualizar ao fechar".
- **FR-712**: A atualização MUST preservar cofre, hosts, grupos, chaves, encaminhamentos,
  perfis, atalhos e preferências; o cofre MUST voltar bloqueado após o reinício.
- **FR-713**: Se a instalação falhar, o app MUST continuar abrindo na versão anterior e
  informar que a atualização não foi concluída.
- **FR-714**: No Windows (instalador), no macOS (app em Aplicativos ou outra pasta gravável) e
  no Linux como AppImage gravável, a atualização MUST ser feita com um clique.
- **FR-715**: Quando a instalação automática não for possível (pacotes do sistema no Linux,
  falta de permissão), o app MUST oferecer baixar o pacote certo, abrir a pasta onde ficou e
  mostrar o comando de instalação para copiar.

**Controlar**

- **FR-716**: As Configurações MUST mostrar a versão instalada, a data da última verificação e
  "Procurar atualizações", além das opções "Verificar automaticamente" e "Receber versões de
  teste".
- **FR-717**: "Procurar atualizações" MUST também estar na paleta de comandos.
- **FR-718**: Todos os textos MUST estar em português do Brasil, e o aviso e o progresso MUST
  ser acessíveis por teclado e leitor de tela.

### Key Entities

- **Versão publicada**: número, se é de teste, data, notas (novidades) e os pacotes disponíveis
  por sistema, arquitetura e formato, cada um com o que permite confirmar sua origem.
- **Estado da atualização**: nenhuma, disponível, baixando (progresso), pronta para instalar,
  falhou (motivo); a versão pulada e o "lembrar depois até".
- **Preferências de atualização**: verificar automaticamente (sim/não), receber versões de teste
  (sim/não), última verificação.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-701**: Com uma versão nova publicada, o aviso aparece em até 10 segundos depois de o app
  abrir, ou em até 6 horas com o app aberto.
- **SC-702**: Do clique em "Atualizar" até o app reaberto na versão nova leva menos de 2 minutos
  numa conexão de 10 Mbit/s, sem nenhum passo fora do app no Windows, no macOS e no AppImage.
- **SC-703**: Em 100% das atualizações, cofre, hosts e preferências continuam iguais e o cofre
  abre com a mesma senha mestra.
- **SC-704**: 100% dos arquivos adulterados ou corrompidos são recusados antes de qualquer
  instalação.
- **SC-705**: Com a verificação automática desligada, o app não faz nenhuma consulta de versão.
- **SC-706**: Uma falha de instalação nunca deixa o app sem abrir: em 100% dos casos ele abre na
  versão anterior ou na nova.

## Assumptions

- As versões são publicadas nas releases públicas do repositório do projeto, como hoje, com
  notas em português; a versão de teste é identificada pelo sufixo `-rc.N`.
- O processo de publicação passa a gerar, para cada pacote, uma assinatura feita com uma chave do
  projeto guardada fora do repositório; o app traz a chave pública correspondente. Isso não
  depende de certificados pagos da Microsoft ou da Apple (os avisos de "app não assinado" do
  sistema continuam valendo até o projeto ter esses certificados).
- A primeira versão capaz de se atualizar precisa ser instalada à mão; a partir dela as próximas
  chegam pelo app.
- O formato de instalação é descoberto pelo próprio app (instalador do Windows, app do macOS,
  pacote do Linux ou AppImage).
- "Sessões encerradas" ao reiniciar podem ser reabertas pelo usuário; restaurar sessões
  automaticamente depois da atualização fica fora desta feature.
- Rebaixar para versões anteriores fica fora do escopo.

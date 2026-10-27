# Feature Specification: Sincronizar o cofre pelo Google Drive

**Feature Branch**: `008-drive-sync`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Integração com Google Drive: toda vez que conectarmos uma conta, ter backup das sessões e hosts e poder usar em qualquer lugar. Decisões do usuário: vai tudo (hosts, grupos, chaves, senhas, encaminhamentos, perfis), criptografado com a senha mestra, sem o Google ver nada legível; sincronizar sempre entre computadores (cada mudança sobe sozinha, ao abrir em outro computador puxa a mais nova; se dois computadores mudarem o mesmo item, o usuário escolhe qual fica)."

## Contexto

O cofre do OpenHost vive só no computador onde foi criado. Quem usa o app no trabalho e em casa,
ou troca de máquina, precisa exportar e importar à mão, e um disco perdido leva junto todos os
hosts, chaves e senhas.

Esta feature liga o cofre a uma conta Google: o conteúdo vai para o Google Drive do próprio
usuário, sempre criptografado com a senha mestra, e fica igual em todos os computadores em que
ele conectar a mesma conta. Também serve de backup: dá para recuperar o cofre num computador
novo e voltar a versões anteriores.

Decisões do usuário: vai tudo (hosts, grupos, chaves, senhas, encaminhamentos, perfis),
criptografado; sincronização automática e contínua entre computadores; em conflito no mesmo
item, o usuário escolhe.

Os requisitos usam a faixa FR-801 em diante e SC-801 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conectar a conta e ter o cofre guardado no Drive (Priority: P1)

Com o cofre desbloqueado, o usuário vai em Configurações → Sincronização e clica em "Conectar
Google Drive". O navegador abre a tela de login do Google, ele autoriza o OpenHost, e volta ao
app. O app envia o cofre, criptografado, para uma área do Drive só do OpenHost e mostra
"Sincronizado agora". Daí em diante, cada mudança (host novo, senha alterada, chave importada)
sobe sozinha em poucos segundos.

**Why this priority**: sem isso não existe nem backup nem uso em outro lugar; sozinho já protege
o usuário de perder tudo.

**Independent Test**: conectar uma conta de teste, criar um host e conferir no Drive que existe
um arquivo do OpenHost atualizado, e que o conteúdo dele não tem nenhum nome de host, endereço,
usuário ou senha legível.

**Acceptance Scenarios**:

1. **Given** o cofre está desbloqueado e não há conta ligada, **When** o usuário conecta a conta
   Google e autoriza, **Then** o app mostra a conta conectada (e-mail) e "Sincronizado agora"
   em até 30 segundos.
2. **Given** a conta está ligada, **When** o usuário cria ou edita um host, **Then** a mudança
   chega ao Drive em até 10 segundos com internet, sem nenhuma ação extra.
3. **Given** o usuário abre o Drive no navegador, **When** procura os arquivos, **Then** não vê
   os arquivos do OpenHost misturados aos seus, e o app não vê nem mexe em nenhum outro arquivo
   do Drive.
4. **Given** o computador está sem internet, **When** o usuário faz mudanças, **Then** o app
   continua funcionando normalmente, mostra "Pendente de sincronizar", e envia tudo quando a
   conexão volta.
5. **Given** o usuário cancela o login no navegador, **When** volta ao app, **Then** nada muda
   e ele pode tentar de novo.

---

### User Story 2 - Usar o mesmo cofre em outro computador (Priority: P1)

Num computador novo, o usuário instala o OpenHost. Na primeira tela, em vez de criar um cofre,
escolhe "Usar meu cofre do Google Drive", conecta a mesma conta e digita a senha mestra. O app
baixa o cofre e abre com todos os hosts, grupos, chaves, senhas, encaminhamentos e perfis.

**Why this priority**: é o "usar em qualquer lugar" pedido; junto com a US1 forma o MVP.

**Independent Test**: com um cofre já sincronizado, abrir o app em outra pasta de dados (como
se fosse outro computador), escolher o Drive, digitar a senha mestra e ver os mesmos hosts e
conseguir conectar usando a senha guardada.

**Acceptance Scenarios**:

1. **Given** um computador sem cofre, **When** o usuário escolhe "Usar meu cofre do Google
   Drive", conecta a conta e digita a senha mestra certa, **Then** o cofre abre com todo o
   conteúdo do Drive e passa a sincronizar.
2. **Given** a senha mestra digitada está errada, **When** confirma, **Then** vê "Senha mestra
   incorreta" e nada é gravado no computador.
3. **Given** um computador que já tem um cofre local com hosts, **When** o usuário conecta uma
   conta que já tem cofre no Drive, **Then** o app pergunta o que fazer: "Juntar os dois",
   "Usar o do Drive (o local vira backup)" ou "Cancelar"; nada é apagado sem essa escolha.
4. **Given** o usuário escolheu juntar, **When** o processo termina, **Then** os itens dos dois
   lados existem uma única vez (itens iguais não duplicam), e o cofre resultante usa a senha
   mestra do Drive.
5. **Given** a conta conectada não tem cofre no Drive, **When** o usuário escolhe "Usar meu
   cofre do Google Drive" num computador novo, **Then** vê que não há cofre nessa conta e pode
   criar um novo, que já nasce sincronizado.

---

### User Story 3 - Mudanças em dois computadores (Priority: P2)

O usuário usa o app no trabalho e em casa. Ao abrir o app em casa, ele puxa sozinho o que mudou
no trabalho. Com os dois abertos ao mesmo tempo, as mudanças de um aparecem no outro em pouco
tempo. Se os dois mudaram o mesmo item antes de sincronizar (por exemplo, o endereço do mesmo
host), o app mostra as duas versões lado a lado e o usuário escolhe qual fica.

**Why this priority**: o uso diário em mais de um lugar depende disso, mas o MVP (US1 + US2) já
entrega backup e restauração.

**Independent Test**: com duas pastas de dados ligadas à mesma conta, mudar hosts diferentes em
cada uma e ver as duas mudanças nas duas; mudar o mesmo host nas duas sem rede e, ao voltar a
rede, ver a escolha de conflito.

**Acceptance Scenarios**:

1. **Given** o computador A criou um host, **When** o computador B abre o app ou está aberto,
   **Then** o host aparece em B em até 1 minuto com os dois online.
2. **Given** A mudou o host X e B mudou o host Y, **When** sincronizam, **Then** os dois ficam
   com as duas mudanças, sem perguntar nada.
3. **Given** A e B mudaram o mesmo host X de jeitos diferentes, **When** sincronizam, **Then**
   o usuário vê "Conflito em X" com as duas versões e escolhe uma; até escolher, nada se
   perde e o app continua usável.
4. **Given** A apagou um host que B editou, **When** sincronizam, **Then** o usuário escolhe
   entre manter a versão editada ou confirmar a exclusão.
5. **Given** a senha mestra foi trocada em A, **When** B sincroniza, **Then** B pede a nova
   senha mestra antes de continuar e não aceita mais a antiga.

---

### User Story 4 - Voltar no tempo e desconectar (Priority: P3)

Nas Configurações → Sincronização, o usuário vê a lista das versões guardadas do cofre (data,
computador que enviou) e pode restaurar uma delas, por exemplo depois de apagar algo sem querer.
Também pode desconectar a conta: escolhe se apaga ou mantém a cópia no Drive, e o cofre local
continua funcionando normalmente.

**Why this priority**: recuperação de erro e controle; o fluxo principal não depende disso.

**Independent Test**: apagar um host, restaurar a versão de antes e ver o host de volta em todos
os computadores ligados; desconectar e conferir que nada mais sai do computador.

**Acceptance Scenarios**:

1. **Given** existem versões anteriores, **When** o usuário restaura a de ontem, **Then** o
   cofre volta a ter exatamente o conteúdo daquela versão, a restauração vira uma nova versão
   (dá para desfazer) e os outros computadores recebem.
2. **Given** a conta está ligada, **When** o usuário desconecta e escolhe "Manter cópia no
   Drive", **Then** nada mais é enviado nem recebido, o cofre local continua inteiro, e a
   autorização do OpenHost na conta é removida deste computador.
3. **Given** o usuário desconecta e escolhe "Apagar do Drive", **When** confirma, **Then** os
   arquivos do OpenHost somem do Drive, e os outros computadores ligados avisam que o cofre da
   nuvem foi removido, sem apagar o cofre local deles.
4. **Given** o usuário revogou o acesso pelo painel da conta Google, **When** o app tenta
   sincronizar, **Then** mostra "Conexão com o Google Drive perdida" com "Conectar de novo",
   sem perder nada local.

---

### Edge Cases

- Drive sem espaço: avisa "Sem espaço no Google Drive", mantém tudo local e tenta de novo depois.
- Cofre bloqueado: nada é enviado nem aplicado enquanto bloqueado; ao desbloquear, sincroniza.
- O app fecha no meio de um envio: o Drive nunca fica com um cofre pela metade; a versão
  anterior continua válida.
- Arquivo no Drive corrompido ou alterado por fora: é recusado (não abre com a senha nem
  confere), o cofre local não é tocado e o usuário pode restaurar uma versão anterior.
- Relógios diferentes entre computadores: a ordem das mudanças não pode depender só do horário
  de cada máquina.
- Cofre muito grande (milhares de hosts, muitas chaves): a sincronização continua funcionando,
  só mais lenta.
- Mesma conta em computadores com versões diferentes do app: uma versão antiga que não entende o
  formato da nuvem avisa para atualizar e não estraga o cofre da nuvem.
- Duas contas Google diferentes em dois computadores: cada uma tem seu cofre; trocar de conta
  exige desconectar a atual.
- Token de acesso expirado: renova sozinho; se não der, pede para conectar de novo.
- Itens que dependem do computador (shells locais, caminhos de arquivos de chave fora do cofre,
  tamanho da janela, fontes instaladas) não devem quebrar em outro sistema: o que não existir lá
  é ignorado ou mostrado como indisponível.

## Requirements *(mandatory)*

### Functional Requirements

**Conta e autorização**

- **FR-801**: O usuário MUST poder conectar uma conta Google pelo navegador padrão do sistema,
  sem digitar a senha do Google dentro do app.
- **FR-802**: O app MUST pedir só o acesso mínimo: uma área do Drive exclusiva do app, sem ver
  nem alterar nenhum outro arquivo do usuário.
- **FR-803**: A autorização da conta MUST ficar guardada protegida no computador (dentro do
  cofre ou no armazenamento seguro do sistema), nunca em texto puro, e MUST ser apagada ao
  desconectar.

**O que vai e como vai**

- **FR-804**: MUST sincronizar todo o conteúdo do cofre: hosts, grupos, credenciais (senhas e
  chaves), hosts conhecidos, encaminhamentos, perfis de terminal, esquemas de cores e atalhos.
- **FR-805**: Tudo o que sai do computador MUST estar criptografado com a chave do cofre,
  derivada da senha mestra; nem o Google nem o projeto conseguem ler nomes de hosts, endereços,
  usuários, senhas ou chaves. A senha mestra MUST NOT sair do computador.
- **FR-806**: Preferências que só fazem sentido no computador (tamanho e posição da janela,
  barra lateral recolhida, shell padrão, aparência do sistema) MUST NOT ser sincronizadas.
- **FR-807**: Um envio interrompido MUST NOT deixar o cofre da nuvem inválido; a última versão
  completa MUST continuar disponível.

**Sincronizar**

- **FR-808**: Com a conta ligada e o cofre desbloqueado, toda mudança MUST ser enviada sozinha
  em até 10 segundos (com internet), e o app MUST buscar mudanças ao desbloquear e
  periodicamente, no máximo a cada 1 minuto enquanto aberto.
- **FR-809**: Sem internet, o app MUST funcionar normalmente e acumular as mudanças para enviar
  depois, mostrando o estado (sincronizado, sincronizando, pendente, erro).
- **FR-810**: Mudanças em itens diferentes feitas em computadores diferentes MUST ser juntadas
  sem perguntar.
- **FR-811**: Mudanças diferentes no mesmo item (ou edição de um lado e exclusão do outro) MUST
  virar um conflito mostrado ao usuário com as duas versões, para ele escolher; até a escolha,
  nenhuma das versões MUST ser perdida.
- **FR-812**: A troca da senha mestra MUST valer em todos os computadores: os outros MUST pedir
  a nova senha antes de continuar sincronizando.

**Primeiro uso e outros computadores**

- **FR-813**: Na primeira tela (sem cofre), MUST existir "Usar meu cofre do Google Drive", que
  conecta a conta, pede a senha mestra do cofre da nuvem e o traz para o computador.
- **FR-814**: Ao conectar uma conta com cofre na nuvem num computador que já tem cofre local,
  o app MUST perguntar entre juntar, usar o da nuvem (guardando o local como backup) ou
  cancelar; MUST NOT apagar nada sem essa escolha.

**Histórico e desconexão**

- **FR-815**: O app MUST guardar versões anteriores do cofre na nuvem (pelo menos as últimas 30
  versões ou 30 dias, o que for maior) e permitir restaurar qualquer uma; a restauração MUST
  virar uma nova versão.
- **FR-816**: Desconectar MUST parar todo envio e recebimento, remover a autorização deste
  computador e perguntar se apaga ou mantém a cópia na nuvem; o cofre local MUST continuar
  intacto.
- **FR-817**: Perda de acesso (autorização revogada, conta removida) MUST ser mostrada com a
  opção de conectar de novo, sem perda de dados locais.

**Geral**

- **FR-818**: Nenhum dado além do cofre criptografado e do necessário para falar com o Google
  Drive MUST sair do computador; nada de telemetria.
- **FR-819**: Textos em português do Brasil; estado da sincronização visível na barra de status
  e nas Configurações, acessível por teclado e leitor de tela.

### Key Entities

- **Conta ligada**: e-mail da conta Google, autorização guardada protegida, data da conexão.
- **Cofre na nuvem**: conteúdo criptografado do cofre, com a informação necessária para abri-lo
  com a senha mestra, e a identificação de versão.
- **Versão do cofre**: data, computador que enviou, e o conteúdo daquela versão (para restaurar).
- **Mudança pendente**: o que mudou localmente e ainda não foi enviado.
- **Conflito**: item afetado, versão local, versão da nuvem, escolha do usuário.
- **Computador**: nome amigável do computador (para o histórico), sem dados de hardware.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-801**: Um usuário conecta a conta e tem o cofre guardado no Drive em menos de 1 minuto,
  sem ler instruções.
- **SC-802**: Num computador novo, o usuário fica com todos os hosts e credenciais prontos para
  conectar em menos de 2 minutos, só com a conta Google e a senha mestra.
- **SC-803**: Mudanças feitas num computador aparecem no outro em até 1 minuto com os dois
  online.
- **SC-804**: Em 100% dos casos, o conteúdo guardado no Drive não contém nenhum nome de host,
  endereço, usuário, senha ou chave legível.
- **SC-805**: Nenhuma mudança é perdida em mudanças simultâneas: 100% dos conflitos chegam ao
  usuário com as duas versões.
- **SC-806**: O app continua 100% utilizável sem internet ou com o Drive fora do ar.
- **SC-807**: Qualquer versão das últimas 30 pode ser restaurada em menos de 1 minuto.

## Assumptions

- O projeto registra o OpenHost no Google Cloud como aplicativo de desktop, com acesso só à área
  de dados do próprio app no Drive. Essa configuração é feita pelo dono do projeto e é
  pré-requisito para publicar (o Google pode exigir verificação do app para uso público).
- A senha mestra é a mesma em todos os computadores que usam o mesmo cofre na nuvem.
- Google Drive é o primeiro provedor; outros (OneDrive, Dropbox, servidor próprio) podem vir
  depois e não fazem parte desta feature.
- O formato `.openhost` de exportação continua existindo para quem não quer usar nuvem.
- Sessões abertas (abas, grupos de terminais) não são sincronizadas; "sessões" aqui são os hosts
  salvos e seus dados de conexão.
- Restaurar versões trabalha com o cofre inteiro; restaurar um item só fica para depois.

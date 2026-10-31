# Feature Specification: Sincronização simples para o usuário final

**Feature Branch**: `013-sync-simples`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Sincronização com o Google Drive simples para o usuário final (sobre a 008). Hoje o caminho assusta e o usuário desiste: a opção fica escondida em Configurações → Sincronização; o Google mostra 'app não verificado'; o app pergunta 'Juntar os dois / Usar o do Drive' com senha da nuvem; a tela mistura nome do computador, histórico e 'Sincronizar agora'; erros aparecem como cartão técnico (código, operação, hora). Objetivo: o usuário vê um botão e, no máximo, uma senha. (1) Oferecer na hora certa [...] (2) O app decide o óbvio [...] (3) Tela enxuta [...] (4) Erros em linguagem humana [...] (5) Recuperação automática de envio interrompido [...] (6) Publicar o cliente OAuth do Google [...]. Restrição inegociável: nada vaza — nem dados do usuário nem dados do projeto."

## Contexto

A sincronização pelo Google Drive (specs/008-drive-sync) funciona e foi validada com uma conta
Google real, mas o primeiro uso mostrou um caminho que faz o usuário comum desistir:

- A opção só existe em Configurações → Sincronização; quem não sabe que ela existe não a encontra.
- O Google mostra "O Google não verificou este app" e só aceita contas cadastradas como teste; a
  autorização vence em 7 dias.
- Ao conectar com cofre dos dois lados, o app pergunta "Juntar os dois" ou "Usar o do Drive", com
  explicações técnicas e a "senha mestra do cofre da nuvem".
- A tela de sincronização mostra ao mesmo tempo conta, nome do computador, última sincronização,
  "Sincronizar agora", versões anteriores e desconectar.
- Erros aparecem como cartão técnico (código, operação, data/hora, versão).
- Um envio interrompido deixou a nuvem com a chave e sem o cofre; o Conectar seguinte pediu a
  senha de um cofre que não existia, e só uma limpeza manual resolveu.

O objetivo é que o usuário veja um botão e, no máximo, uma senha. O caminho mais fácil não passa
pelo Google: quem já tem o Google Drive, o OneDrive ou o Dropbox instalado no computador tem uma
pasta que já sincroniza sozinha; o app grava ali o cofre cifrado, com um clique, sem conta, sem
navegador e sem permissão. "Conectar Google Drive" continua como alternativa para quem não tem
esses programas. A sincronização em si (o que vai, cifragem, conflitos, histórico, troca de senha)
é a mesma nos dois caminhos.

Os requisitos usam a faixa FR-1301 em diante e SC-1301 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sincronizar pela pasta com um clique (Priority: P1)

O app encontra no computador a pasta do Google Drive, do OneDrive ou do Dropbox e oferece
"Sincronizar pela pasta do Google Drive" (ou do programa encontrado). Um clique e pronto: o app
grava o cofre cifrado numa pasta "OpenHost" dentro dela, e o próprio programa do Drive leva para os
outros computadores. No outro computador, o app acha a mesma pasta com o cofre e oferece "Usar o
cofre da pasta do Google Drive", pedindo só a senha.

**Why this priority**: é o caminho sem autorização nenhuma; para quem já tem um desses programas,
some toda a parte do Google.

**Independent Test**: duas pastas de dados do app apontando para a mesma pasta comum (simulando a
pasta sincronizada) → ligar no primeiro, abrir no segundo com a senha, editar nos dois.

**Acceptance Scenarios**:

1. **Given** a pasta do Google Drive, do OneDrive ou do Dropbox existe neste computador, **When**
   o usuário abre o convite ou a tela de sincronização, **Then** a primeira opção é "Sincronizar
   pela pasta do <programa>", e "Conectar Google Drive" aparece como alternativa.
2. **Given** a pasta sem cofre do OpenHost, **When** o usuário clica nessa opção, **Then** o cofre
   é gravado cifrado na pasta, sem nenhuma pergunta, e o app mostra "Sincronizado pela pasta do
   <programa>".
3. **Given** a pasta já tem o cofre de outro computador, **When** o usuário clica nessa opção,
   **Then** o comportamento é o da US3: uma senha, e o app usa ou junta sozinho.
4. **Given** mais de um programa encontrado, **Then** o app oferece o primeiro na ordem Google
   Drive, OneDrive, Dropbox, e os outros em "Mais opções", junto de "Escolher outra pasta".
5. **Given** nenhum programa encontrado, **Then** o convite oferece "Conectar Google Drive" e,
   em "Mais opções", "Escolher uma pasta".
6. **Given** a sincronização pela pasta ligada, **When** o usuário muda um host, **Then** a mudança
   é gravada na pasta em até 10 segundos; mudanças que chegam pela pasta vindas de outro computador
   aparecem neste em até 1 minuto, sem ação do usuário.

---

### User Story 2 - Ligar a sincronização sem procurar (Priority: P1)

Logo depois de criar o cofre, o usuário vê um convite: "Usar estes hosts em outros computadores?",
com a opção mais fácil disponível (a pasta, US1, ou "Conectar Google Drive") e "Agora não". No caso
do Google, um clique abre o navegador, ele escolhe a conta, autoriza e volta ao app, que mostra
"Sincronizado com <e-mail>". Quem dispensou o convite acha o mesmo
caminho no ícone de nuvem da barra de status.

**Why this priority**: sem achar a opção, nada mais importa; é a maior perda hoje.

**Independent Test**: cofre novo com o Drive falso → convite aparece → Conectar → "Sincronizado".

**Acceptance Scenarios**:

1. **Given** o usuário acabou de criar o cofre e a sincronização está disponível nesta versão,
   **When** o cofre abre pela primeira vez, **Then** aparece o convite com a opção mais fácil
   disponível e "Agora não", sem bloquear o uso do app.
2. **Given** o convite, **When** o usuário clica em "Agora não", **Then** o convite some e não
   volta sozinho nesta nem nas próximas execuções.
3. **Given** a sincronização desligada, **When** o usuário clica no ícone de nuvem da barra de
   status, **Then** vê o mesmo convite.
4. **Given** a nuvem da conta vazia, **When** o usuário autoriza no navegador, **Then** o cofre é
   enviado sem nenhuma pergunta e o app mostra "Sincronizado com <e-mail>".
5. **Given** uma versão compilada sem a conexão com o Google, **When** o cofre é criado, **Then**
   o convite e o ícone de nuvem oferecem só a pasta; sem pasta encontrada, oferecem "Escolher uma
   pasta".

---

### User Story 3 - O app decide o óbvio ao conectar (Priority: P1)

Ao conectar uma conta que já tem cofre, o app não pergunta o que fazer: num computador sem hosts
pede só "a senha que você usa no outro computador" e traz o cofre; num computador com hosts pede a
mesma senha e junta os dois. A escolha de usar só o cofre da nuvem continua possível, em "Mais
opções".

**Why this priority**: a pergunta "Juntar / Usar o do Drive" é o ponto em que o usuário trava.

**Independent Test**: duas pastas de dados com o Drive falso, nos três casos (nuvem vazia,
computador vazio, os dois com hosts).

**Acceptance Scenarios**:

1. **Given** a nuvem com cofre e este computador com um cofre vazio (sem hosts, grupos nem
   credenciais), **When** o usuário
   conecta, **Then** a única pergunta é a senha do outro computador, e com ela este computador
   passa a ter os hosts da nuvem; o cofre local anterior fica guardado como cópia de segurança.
2. **Given** a nuvem com cofre e este computador com hosts, **When** o usuário conecta e digita a
   senha do outro computador, **Then** os dois cofres são juntados sem outra pergunta, itens iguais
   não duplicam, o cofre local anterior fica como cópia de segurança e a tela avisa, antes de
   confirmar, que a partir dali a senha deste computador passa a ser a do outro.
3. **Given** a tela da senha, **When** o usuário abre "Mais opções", **Then** pode escolher usar
   só o cofre da nuvem (o local vira cópia de segurança) em vez de juntar.
4. **Given** a senha errada, **When** o usuário confirma, **Then** vê "Senha incorreta" no próprio
   campo e nada é alterado neste computador nem na nuvem.
5. **Given** um computador sem cofre, **When** o usuário escolhe "Usar meu cofre do Google Drive"
   na primeira tela, **Then** o caminho é conta → senha → hosts, como hoje.

---

### User Story 4 - Envio interrompido se resolve sozinho (Priority: P1)

Se um envio cai no meio (rede, app fechado, erro do Google) e deixa na nuvem só a chave, sem
nenhuma versão do cofre, o próximo Conectar trata a nuvem como vazia e envia o cofre, sem pedir
senha de um cofre que não existe.

**Why this priority**: foi o que travou o primeiro teste real e exigiu limpeza manual.

**Independent Test**: Drive falso com só o arquivo de chave → Conectar envia direto.

**Acceptance Scenarios**:

1. **Given** a nuvem com a chave e sem nenhuma versão do cofre, **When** o usuário conecta,
   **Then** o app substitui a chave e envia o cofre, sem perguntar nada.
2. **Given** a nuvem com chave e com versões do cofre, **When** o usuário conecta, **Then** o
   comportamento é o da US3 (nada é apagado).

---

### User Story 5 - Tela e erros que não assustam (Priority: P2)

Com a sincronização ligada, a tela mostra uma linha de estado ("✓ Sincronizado com <e-mail>") e
"Desconectar". Nome do computador, versões anteriores e "Sincronizar agora" ficam em "Mais
opções". Erros aparecem como frases curtas ("Não deu para falar com o Google Drive. Vamos tentar de
novo sozinhos."), com os dados técnicos em "Detalhes", recolhido.

**Why this priority**: reduz o medo depois de ligado; não impede ligar.

**Independent Test**: estados sincronizado, pendente, sem rede e autorização perdida com o Drive
falso; conferir texto, "Mais opções" e "Detalhes".

**Acceptance Scenarios**:

1. **Given** a sincronização ligada e em dia, **When** o usuário abre a tela de sincronização,
   **Then** vê só a linha de estado com o e-mail, "Desconectar" e "Mais opções" (fechado).
2. **Given** "Mais opções" aberto, **Then** estão lá o nome do computador, as versões anteriores e
   "Sincronizar agora", com o mesmo comportamento de hoje.
3. **Given** uma falha de rede, **When** ela acontece, **Then** o app mostra uma frase sem código
   técnico e tenta de novo sozinho; ao voltar a rede, o estado volta a "Sincronizado" sem ação do
   usuário.
4. **Given** qualquer erro da sincronização, **When** o usuário abre "Detalhes", **Then** vê o
   código e a hora do erro, e nada além disso que identifique o cofre, a conta ou o projeto.
5. **Given** a autorização perdida, **Then** a frase diz o que fazer ("Conecte de novo") e o botão
   está ao lado.

---

### User Story 6 - Google sem aviso de app não verificado (Priority: P2)

Qualquer pessoa com conta Google conecta sem ser cadastrada como teste, sem o aviso "O Google não
verificou este app" e sem precisar conectar de novo a cada semana.

**Why this priority**: o aviso do Google é o segundo maior ponto de desistência, mas não depende
do app; pode andar em paralelo.

**Independent Test**: uma conta Google que nunca foi cadastrada como teste conecta pela versão de
release, sem aviso de app não verificado.

**Acceptance Scenarios**:

1. **Given** o app publicado no Google, **When** uma conta qualquer conecta, **Then** a tela do
   Google mostra o nome OpenHost e pede só o acesso à área do app no Drive e o e-mail, sem aviso de
   app não verificado.
2. **Given** a página inicial e a política de privacidade publicadas, **When** alguém as abre,
   **Then** elas explicam o que o app guarda e envia em linguagem simples, sem nenhum identificador
   interno, credencial ou dado de usuário.

---

### Edge Cases

- O programa da pasta ainda está baixando um arquivo do cofre: arquivo incompleto ou que não abre é
  tratado como "ainda não chegou" e lido de novo depois, sem erro para o usuário.
- O programa da pasta cria cópias de conflito com outro nome (por exemplo "(cópia em conflito)"):
  o app ignora arquivos com nomes que não são dele e resolve conflitos pelo mesmo caminho da 008.
- A pasta some (programa desinstalado, disco desligado): estado "Pendente" com a frase "A pasta do
  <programa> não está disponível"; as mudanças ficam guardadas e vão quando a pasta voltar.
- Pasta escolhida à mão que não sincroniza com nada (pasta comum): funciona como cópia local; o app
  não tenta adivinhar.

- Usuário clica em "Conectar" e fecha o navegador sem autorizar: o app volta ao estado anterior em
  até o tempo limite atual, sem mensagem de erro alarmante ("Conexão cancelada").
- Computador com cofre que tem só grupos ou credenciais, sem hosts: conta como "com dados" e segue
  o caminho de juntar (nada local é descartado sem cópia de segurança).
- Nuvem com chave de uma época de senha mais nova que as versões presentes: segue o fluxo de troca
  de senha da 008; não é tratado como envio interrompido.
- O convite aparece só para cofres criados depois desta versão; quem já usa o app vê o ícone de
  nuvem, não o convite.
- Erro que se repete por mais de 1 hora sem rede: o estado fica em "Pendente" com a contagem de
  mudanças, sem novos avisos a cada tentativa.
- Conta com cofre da nuvem de versão mais nova do app: mensagem "Atualize o OpenHost" (como hoje),
  sem juntar.

## Requirements *(mandatory)*

### Functional Requirements

**Sincronizar pela pasta (US1)**

- **FR-1322**: O app MUST encontrar sozinho as pastas do Google Drive, do OneDrive e do Dropbox
  instalados no computador, nos três sistemas, e oferecer a primeira encontrada como opção
  principal de sincronização.
- **FR-1323**: Sincronizar pela pasta MUST NOT exigir conta, navegador nem autorização; o app MUST
  usar só uma subpasta "OpenHost" dentro dela e MUST NOT ler nem alterar nada fora dessa subpasta.
- **FR-1324**: A sincronização pela pasta MUST ter o mesmo comportamento da sincronização pelo
  Google: cofre cifrado, mudanças enviadas sozinhas, mudanças recebidas sozinhas, conflitos,
  versões anteriores, troca de senha e "Desconectar" (que pergunta se apaga ou mantém a cópia na
  pasta).
- **FR-1325**: O usuário MUST poder escolher outra pasta em "Mais opções".
- **FR-1326**: Os nomes dos arquivos na pasta MUST NOT conter nada do conteúdo do cofre (rótulos,
  endereços, usuários) nem o nome do computador.
- **FR-1327**: Arquivos incompletos, ilegíveis ou com nomes desconhecidos na subpasta MUST ser
  ignorados até ficarem legíveis, sem apagar nada que o app não criou.

**Oferecer na hora certa (US2)**

- **FR-1301**: Depois de criar um cofre, o app MUST mostrar um convite não bloqueante para ligar a
  sincronização, com a opção mais fácil disponível (pasta encontrada; senão "Conectar Google
  Drive"; senão "Escolher uma pasta") e "Agora não".
- **FR-1302**: "Agora não" MUST esconder o convite de vez para aquele cofre; a escolha MUST ser
  guardada entre execuções.
- **FR-1303**: A barra de status MUST ter um ícone de nuvem que mostra o estado (desligada,
  sincronizado, pendente, erro) e, desligada, leva ao convite.
- **FR-1304**: Configurações → Sincronização MUST continuar existindo com as mesmas funções.

**Decidir o óbvio (US3, US4)**

- **FR-1305**: Ao conectar uma conta sem cofre na nuvem, o app MUST enviar o cofre sem perguntas.
- **FR-1306**: Nuvem só com a chave e sem nenhuma versão do cofre MUST ser tratada como nuvem
  vazia: a chave é substituída e o cofre enviado, sem pedir senha.
- **FR-1307**: Ao conectar uma conta com cofre na nuvem, o app MUST pedir uma única senha, com o
  rótulo "Senha que você usa no outro computador".
- **FR-1308**: Se o cofre deste computador não tiver hosts, grupos, credenciais nem
  encaminhamentos, o app MUST usar o cofre da nuvem; caso contrário MUST juntar os dois. Nos dois
  casos o cofre local anterior MUST ser guardado como cópia de segurança.
- **FR-1309**: Antes de juntar, a tela da senha MUST avisar em uma frase que a senha deste
  computador passará a ser a do outro.
- **FR-1310**: "Mais opções" na tela da senha MUST oferecer "Usar só o cofre do Google Drive".
- **FR-1311**: Senha errada MUST ser indicada no próprio campo, sem alterar nada local nem na nuvem.

**Tela e erros (US5)**

- **FR-1312**: Com a sincronização ligada, a tela MUST mostrar só a linha de estado com o e-mail,
  "Desconectar" e "Mais opções" fechado; nome do computador, versões anteriores e "Sincronizar
  agora" MUST ficar em "Mais opções".
- **FR-1313**: Todo erro da sincronização MUST ter uma frase em português simples que diga o que
  aconteceu e o que fazer, sem código técnico visível.
- **FR-1314**: Os dados técnicos do erro MUST ficar em "Detalhes", recolhido, limitados a código,
  operação e hora.
- **FR-1315**: Falhas de rede e respostas temporárias do Google MUST ser tentadas de novo sozinhas,
  sem aviso a cada tentativa; o usuário só vê o estado "Pendente".

**Google (US6)**

- **FR-1316**: O cliente OAuth do projeto MUST sair do modo de teste, com nome OpenHost, página
  inicial e política de privacidade públicas, e pedir só o acesso à área do app no Drive e ao
  e-mail.
- **FR-1317**: A página inicial e a política de privacidade MUST descrever, em português e em
  linguagem simples, o que o app guarda e envia, e MUST NOT conter credenciais, identificadores do
  projeto no Google, e-mails pessoais nem dados de usuário.

**Nada vaza (todas)**

- **FR-1318**: Senha mestra, chave do cofre e tokens da conta Google MUST NOT sair do computador
  e MUST NOT aparecer em telas, "Detalhes", logs, mensagens de erro ou arquivos temporários. O
  cofre MUST sair do computador só cifrado.
- **FR-1319**: O e-mail da conta MUST aparecer só na tela de sincronização e no ícone de nuvem
  (dica), nunca em "Detalhes", logs ou mensagens de erro.
- **FR-1320**: As credenciais OAuth do projeto MUST existir só nos segredos do repositório e no
  build de release; MUST NOT estar no git, em logs de CI, em páginas publicadas nem em mensagens
  do app. O repositório MUST ignorar arquivos de credencial baixados do Google.
- **FR-1321**: Textos novos MUST estar em português do Brasil, seguir a identidade visual (preto
  piano com o laranja do chevron) e ser operáveis por teclado e leitor de tela.

### Key Entities

- **Convite de sincronização**: estado por cofre — mostrado, dispensado.
- **Lugar de sincronização**: pasta (com o programa detectado ou escolhida à mão) ou Google Drive
  pela conta; um por cofre.
- **Estado da nuvem ao conectar**: vazia, só chave (envio interrompido), com cofre, de versão mais
  nova.
- **Erro de sincronização apresentável**: frase, ação sugerida, detalhes (código, operação, hora).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1307**: Com a pasta de um dos três programas presente, ligar a sincronização leva 1 clique
  depois do convite, sem navegador e sem nenhuma pergunta (nuvem vazia).
- **SC-1308**: Duas instalações apontando para a mesma pasta convergem para os mesmos hosts em até
  1 minuto depois de cada mudança, nos cenários de edição em itens diferentes e no mesmo item.
- **SC-1301**: Num cofre novo, ligar a sincronização com a nuvem vazia leva no máximo 2 cliques no
  app mais a autorização no Google, sem nenhuma pergunta.
- **SC-1302**: Num segundo computador, usar o cofre da nuvem pede exatamente um campo (a senha), em
  100% dos casos testados (computador vazio e com hosts).
- **SC-1303**: Um envio interrompido nunca exige ação manual fora do app: o Conectar seguinte
  conclui o envio em 100% dos casos testados.
- **SC-1304**: Nenhuma tela ou mensagem da sincronização mostra código técnico fora de "Detalhes".
- **SC-1305**: Uma busca no repositório, no histórico do git, nos logs de CI, nas páginas
  publicadas e nos logs do app não encontra senha, chave do cofre, token, segredo OAuth nem o
  conteúdo de hosts.
- **SC-1306**: Uma conta Google não cadastrada como teste conecta pela versão de release sem aviso
  de app não verificado.

## Assumptions

- A sincronização da 008 (formato, cifragem, conflitos, histórico, troca de senha) não muda; esta
  feature acrescenta a pasta como segundo lugar de guarda e muda o caminho de ligar, as decisões
  automáticas e a apresentação.
- Quem leva os arquivos entre computadores no caminho da pasta é o programa do Drive, do OneDrive
  ou do Dropbox; o app não fala com esses serviços pela internet. Quem não tem nenhum deles usa
  "Conectar Google Drive".
- Só um lugar de sincronização por cofre de cada vez (pasta ou Google Drive pela conta).
- Num app de computador, o "segredo" do cliente OAuth vai embutido no programa distribuído e pode
  ser extraído dele; o Google trata esse valor como não confidencial para apps instalados, e a
  proteção da conta vem do PKCE e do retorno só para 127.0.0.1. "Nada vaza" para o projeto
  significa: ele nunca é publicado em texto (git, logs, páginas, mensagens) além do próprio binário.
- Página inicial e política de privacidade ficam no GitHub Pages do repositório.
- Os três escopos usados (área do app no Drive, e-mail, openid) não são confidenciais; o Google
  costuma publicar sem a verificação demorada, mas pode pedir confirmação de marca.
- "Vazio" (FR-1308) olha o conteúdo do cofre, não as preferências.
- O convite não aparece para cofres criados antes desta versão (edge case).

# Feature Specification: Tela inicial e conexão rápida

**Feature Branch**: `010-quick-connect`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Tela inicial e conexão rápida (bloco 2 da revisão de UX): sem sessão aberta, a área principal mostra uma barra 'host ou user@host:porta' com Enter para conectar sem cadastrar o host, e recentes e favoritos em cards, sem tirar a barra lateral."

## Contexto

Sem sessão aberta, a área principal do OpenHost mostra só um ícone, uma frase e o botão de
terminal local. Para um acesso pontual (um equipamento que o usuário vai usar uma vez), é preciso
cadastrar o host antes. E os hosts mais usados ficam misturados na lista lateral, que com mais de
100 hosts exige busca toda vez.

Esta spec transforma a tela vazia num ponto de partida: uma barra de conexão rápida, os hosts
usados recentemente e os favoritos. A barra lateral continua como está.

Os requisitos usam a faixa FR-1001 em diante e SC-1001 em diante.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conexão rápida sem cadastrar (Priority: P1)

O usuário digita `admin@10.0.0.1:2222` (ou só `10.0.0.1`) na barra da tela inicial e aperta
Enter. O app abre uma sessão SSH sem criar host: confirma a chave do servidor como sempre, pede o
usuário (se faltou) e a senha, e conecta. Na aba, uma opção "Salvar como host" abre o editor já
preenchido.

**Why this priority**: é o ganho mais direto para quem faz acessos pontuais; hoje exige cadastrar
e depois apagar.

**Independent Test**: com o cofre vazio, digitar `pwuser@<servidor de teste>:<porta>`, Enter,
aceitar a chave, digitar a senha, ver o shell; salvar como host e conferir os campos no editor.

**Acceptance Scenarios**:

1. **Given** a tela inicial, **When** o usuário digita `user@host:porta` e aperta Enter, **Then**
   abre uma aba com o título `user@host` e o app conecta pedindo a senha (ou usando o agente SSH,
   se houver chave carregada).
2. **Given** um alvo sem usuário (`10.0.0.1`), **When** o usuário aperta Enter, **Then** o app
   pede o usuário antes de pedir a senha.
3. **Given** um alvo inválido (porta 0, espaço no meio, vazio), **When** o usuário aperta Enter,
   **Then** a barra mostra o erro e nada é aberto.
4. **Given** uma sessão rápida aberta, **When** o usuário escolhe "Salvar como host" na aba,
   **Then** o editor de host abre com endereço, porta e usuário preenchidos; a senha digitada não é
   reaproveitada.
5. **Given** uma sessão rápida, **When** a conexão cai e o usuário reconecta, **Then** o app pede a
   senha de novo (nada foi guardado).
6. **Given** um alvo que corresponde exatamente a um host salvo (mesmo endereço, porta e usuário),
   **When** o usuário aperta Enter, **Then** o app abre o host salvo, com as credenciais dele.

---

### User Story 2 - Recentes e favoritos na tela inicial (Priority: P1)

Sem sessão aberta, a tela inicial mostra até 8 cards de hosts usados recentemente (mais recente
primeiro) e, acima, os favoritos. Um clique (ou Enter) conecta. O usuário marca e desmarca
favoritos pelo menu do host na lista lateral ou pela estrela do card.

**Why this priority**: tira a busca do caminho para os hosts do dia a dia.

**Independent Test**: conectar a dois hosts, fechar as abas e ver os dois em "Recentes" na ordem
certa; marcar um como favorito e vê-lo em "Favoritos"; reiniciar o app e ver os dois blocos iguais.

**Acceptance Scenarios**:

1. **Given** o usuário conectou ao host A e depois ao B, **When** fecha todas as abas, **Then**
   "Recentes" mostra B e depois A, com rótulo, endereço, ícone e cor do ambiente.
2. **Given** um card, **When** o usuário clica nele ou aperta Enter com ele focado, **Then** o app
   conecta àquele host.
3. **Given** um host, **When** o usuário escolhe "Favoritar" no menu da lista ou na estrela do
   card, **Then** ele aparece em "Favoritos" (em ordem alfabética) e não se repete em "Recentes".
4. **Given** um host recente que foi excluído, **When** a tela inicial aparece, **Then** ele não é
   mostrado.
5. **Given** conexões rápidas recentes, **When** a tela inicial aparece, **Then** elas aparecem em
   "Recentes" como `user@host:porta`, e o clique abre a conexão rápida de novo.
6. **Given** nenhum recente nem favorito, **When** a tela inicial aparece, **Then** ela mostra só a
   barra de conexão, o botão de terminal local e uma dica de como favoritar.

---

### User Story 3 - Barra de conexão sugere hosts salvos (Priority: P2)

Enquanto o usuário digita na barra, uma lista abaixo dela sugere hosts salvos que batem com o texto
(rótulo, endereço, tags), com setas para escolher. Enter numa sugestão abre o host salvo; Enter sem
sugestão escolhida faz a conexão rápida.

**Why this priority**: une "buscar" e "conectar" num lugar só, mas a busca da lateral já resolve.

**Independent Test**: digitar parte do rótulo de um host salvo, ver a sugestão, seta para baixo e
Enter, e conferir que abriu o host salvo.

**Acceptance Scenarios**:

1. **Given** hosts salvos, **When** o usuário digita "olt", **Then** até 6 sugestões aparecem, com
   o texto que bateu destacado.
2. **Given** sugestões visíveis, **When** o usuário usa seta para baixo e Enter, **Then** o host
   sugerido abre.
3. **Given** sugestões visíveis, **When** o usuário aperta Esc, **Then** as sugestões somem e o
   texto fica.

---

### Edge Cases

- IPv6: `[2001:db8::1]:2222` e `user@[2001:db8::1]` são aceitos; `2001:db8::1` sem colchetes é
  aceito como endereço sem porta.
- Porta ausente → 22. Porta fora de 1–65535 → erro.
- Alvo com `ssh ` na frente (colado de um terminal), como `ssh -p 2222 user@host`: o app entende
  `-p` e ignora o `ssh`; outras opções são recusadas com mensagem.
- Cofre bloqueado: a tela inicial não aparece (vale a tela de desbloqueio, como hoje).
- Conexão rápida com algoritmos legados: usa o padrão "algoritmos legados" das Configurações.
- Recentes guardam só o alvo (`user@host:porta`) ou o id do host; nunca senha.
- A tela inicial aparece também quando todas as abas são fechadas, não só ao abrir o app.
- Muitos favoritos: a área rola; os recentes ficam abaixo.
- Atalho para focar a barra de conexão (Ctrl+L, ⌘L no macOS) com a tela inicial à frente.

## Requirements *(mandatory)*

### Functional Requirements

**Conexão rápida (US1)**

- **FR-1001**: A tela inicial MUST ter uma barra de texto para alvos no formato
  `[usuário@]endereço[:porta]`, com IPv6 entre colchetes quando houver porta, e aceitar
  `ssh [-p porta] [usuário@]endereço` colado.
- **FR-1002**: Enter com alvo válido MUST abrir uma sessão SSH sem criar host nem credencial no
  cofre; a verificação da chave do servidor MUST ser a mesma dos hosts salvos.
- **FR-1003**: A autenticação da conexão rápida MUST tentar o agente SSH (se disponível) e depois
  pedir a senha ao usuário; a senha MUST NOT ser guardada nem reaproveitada em reconexões.
- **FR-1004**: Alvo sem usuário MUST fazer o app pedir o usuário antes da autenticação.
- **FR-1005**: Alvo igual a um host salvo (endereço normalizado, porta e usuário) MUST abrir o host
  salvo.
- **FR-1006**: A aba de uma sessão rápida MUST ter a ação "Salvar como host", que abre o editor com
  endereço, porta e usuário preenchidos.
- **FR-1007**: Alvo inválido MUST mostrar o motivo na barra sem abrir aba.

**Tela inicial (US2)**

- **FR-1008**: Sem aba aberta (e com o cofre desbloqueado), a área principal MUST mostrar, nesta
  ordem: a barra de conexão, os favoritos, os recentes e o botão de terminal local.
- **FR-1009**: "Recentes" MUST mostrar até 8 itens, do mais recente para o mais antigo, entre hosts
  salvos e alvos de conexão rápida, sem repetir favoritos e sem hosts excluídos.
- **FR-1010**: Os recentes MUST ser guardados só nesta máquina (não sincronizam) e conter apenas o
  id do host ou o alvo `usuário@endereço:porta`.
- **FR-1011**: Usuários MUST poder favoritar e desfavoritar um host pelo menu da lista lateral e
  pela estrela do card; o favorito MUST ficar no host (segue na sincronização e na exportação).
- **FR-1012**: Cada card MUST mostrar rótulo, `usuário@endereço[:porta]`, ícone do sistema ou
  fabricante e a cor do ambiente (specs/009), e conectar com clique ou Enter.

**Sugestões (US3)**

- **FR-1013**: Ao digitar na barra, o app MUST sugerir até 6 hosts salvos que batem com o texto
  (mesma busca da lista lateral), navegáveis por setas, com Esc para fechar.
- **FR-1014**: Enter com uma sugestão escolhida MUST abrir o host salvo; sem sugestão escolhida,
  MUST fazer a conexão rápida.

**Geral**

- **FR-1015**: Ctrl+L (⌘L no macOS) com a tela inicial à frente MUST focar a barra de conexão.
- **FR-1016**: Todos os textos em português do Brasil, controles operáveis só pelo teclado e com
  nome acessível.

### Key Entities

- **Alvo rápido**: endereço, porta e usuário (opcional) digitados na barra. Não é guardado no
  cofre; vai para os recentes locais.
- **Recente**: referência a um host salvo (id) ou a um alvo rápido, com a data do último uso.
  Lista local, no máximo 8 itens guardados (20 internamente, para sobrarem 8 depois de filtrar).
- **Host** (existente): ganha `favorite` (verdadeiro/falso).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1001**: Um acesso pontual a um equipamento não cadastrado leva no máximo a digitação do alvo,
  Enter, aceitar a chave e a senha — nenhuma tela de cadastro.
- **SC-1002**: Abrir um host favorito ou recente a partir da tela inicial leva 1 clique (ou foco e
  Enter), sem busca.
- **SC-1003**: Nenhuma senha de conexão rápida aparece no cofre, nos recentes, nos logs nem no
  diretório de dados (varredura de segredos do e2e).
- **SC-1004**: Os 12 formatos de alvo da lista de testes (com e sem usuário, porta, IPv6, `ssh -p`)
  são interpretados certo, e os 6 inválidos são recusados com mensagem.
- **SC-1005**: A tela inicial aparece em até 100 ms depois de fechar a última aba.

## Assumptions

- A conexão rápida usa só agente SSH e senha digitada; chave privada de arquivo fica para depois
  (o usuário pode salvar como host e escolher a chave).
- "Recentes" registra a conexão quando a sessão chega a conectada, não ao tentar.
- Favoritos não têm ordem manual nesta versão (alfabética).
- O campo `favorite` vai no JSON selado do host, como os campos da 009 (sem mudança de esquema).
- Conexão rápida não aparece na barra lateral; só na aba e nos recentes.
- Esta spec parte da 009 (cor do ambiente nos cards, busca por tags nas sugestões).

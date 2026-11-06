# Feature Specification: Menos memória e terminal mais leve

**Feature Branch**: `014-desempenho`

**Created**: 2026-11-06

**Status**: Draft

**Input**: Pedido do usuário: "otimizar a ferramenta pra não usar muita ram, otimizar terminal". Linha
de base medida em 2026-11-06 (ver [baseline.md](./baseline.md)).

## Contexto: o que foi medido

Windows 11, build de teste, memória privada do app (processo principal + processos da tela
embutida). Os shells abertos pelo usuário (PowerShell, ~55 MB cada) **não** contam: são programas
dele, não do OpenHost.

| Cenário | Processo principal | Tela embutida | Memória da interface |
|---|---|---|---|
| Cofre recém-aberto, sem abas | 313 MB | 247 MB | 7 MB |
| 5 terminais | 315 MB | 401 MB | 18 MB |
| 20 terminais | 320 MB | 740 MB | 47 MB |
| 20 abas, uma com 60 s de saída contínua | 68 MB | 662 MB | 86 MB |
| Depois de fechar as 20 e liberar memória | 65 MB | 482 MB | 29 MB |

Leitura:

1. **Pico ao abrir o cofre**: o processo principal fica ~250 MB acima do necessário por minutos
   depois de abrir ou criar o cofre (a proteção da senha mestra usa muita memória de propósito,
   mas ela não é devolvida ao sistema logo depois).
2. **Cada aba de terminal custa ~25 MB** na tela embutida.
3. **Fechar abas não devolve a memória**: depois de fechar todas, a tela embutida fica 235 MB acima
   do início e a memória da interface 22 MB acima, sem nenhum terminal na tela.
4. **Saída intensa** faz a memória da interface crescer (47 → 86 MB em 60 s).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - App leve em repouso (Priority: P1)

Quem deixa o OpenHost aberto o dia inteiro, com o cofre aberto e poucas abas, não quer ver o app
entre os que mais gastam memória no Gerenciador de Tarefas.

**Why this priority**: É o uso mais comum e o pico de ~250 MB ao abrir o cofre é a maior perda
isolada; afeta todo usuário, toda vez que abre o app.

**Independent Test**: Abrir o app, criar/abrir o cofre, esperar 10 s e medir a memória total do
app sem abas.

**Acceptance Scenarios**:

1. **Given** o app recém-aberto, **When** o usuário abre o cofre e espera 10 s, **Then** a memória
   total do app fica em no máximo 300 MB.
2. **Given** o cofre aberto, **When** o usuário bloqueia e desbloqueia 5 vezes, **Then** a memória
   em repouso não cresce mais que 20 MB em relação ao primeiro desbloqueio.

---

### User Story 2 - Fechar abas devolve a memória (Priority: P1)

Operador de NOC abre e fecha dezenas de sessões ao longo do turno. Ao fechar, a memória daquela
aba tem que voltar; o app não pode ir engordando até precisar ser reiniciado.

**Why this priority**: Sem isso qualquer outra economia some com o tempo de uso; é um vazamento.

**Independent Test**: Medir em repouso, abrir 20 terminais, fechar todos, liberar memória e medir
de novo; repetir o ciclo 3 vezes.

**Acceptance Scenarios**:

1. **Given** o app em repouso medido, **When** o usuário abre 20 terminais e fecha todos, **Then**
   em até 30 s a memória total volta a no máximo 30 MB acima do repouso.
2. **Given** 3 ciclos seguidos de abrir e fechar 20 terminais, **Then** a memória após o terceiro
   ciclo não passa da memória após o primeiro mais 15 MB.

---

### User Story 3 - Cada aba custa menos (Priority: P2)

Quem trabalha com muitas abas ao mesmo tempo (10–20 equipamentos) precisa que cada aba aberta
pese pouco, inclusive as que estão em segundo plano.

**Why this priority**: Ganho grande para quem usa muitas abas, mas depende de mudanças no terminal
que precisam preservar histórico, busca e aparência.

**Independent Test**: Medir a memória com 0 e com 20 terminais abertos e ociosos; dividir a
diferença por 20.

**Acceptance Scenarios**:

1. **Given** 20 terminais abertos e ociosos, **Then** o custo médio por aba na memória do app é
   pelo menos 40% menor que na linha de base (≤ 15 MB por aba).
2. **Given** uma aba em segundo plano com histórico, **When** o usuário volta para ela, **Then** o
   histórico, a seleção de cores, a busca e a posição de rolagem estão como estavam, e a troca leva
   menos de 100 ms.

---

### User Story 4 - Saída intensa sem engordar (Priority: P2)

Comandos que despejam muito texto (logs, `tail -f`, `show running-config` de equipamento grande)
não podem fazer o app crescer sem limite nem travar a interface.

**Why this priority**: Comum em NOC e é onde o crescimento acontece hoje; mas a maioria das sessões
não fica despejando texto o tempo todo.

**Independent Test**: Uma aba com saída contínua por 5 minutos; medir a memória da interface a cada
minuto e a resposta ao teclado nas outras abas.

**Acceptance Scenarios**:

1. **Given** uma aba com saída contínua, **When** passam 5 minutos, **Then** a memória da interface
   para de crescer depois que o histórico enche (variação ≤ 10 MB entre o minuto 2 e o minuto 5).
2. **Given** a saída contínua numa aba, **When** o usuário troca para outra aba e digita, **Then**
   a troca leva menos de 100 ms e o eco das teclas aparece sem atraso perceptível (≤ 50 ms
   no percentil 95).
3. **Given** saída contínua, **Then** o histórico mantém no mínimo 10.000 linhas (FR-015).

---

### User Story 5 - Medição repetível (Priority: P3)

A equipe precisa saber se uma mudança futura piorou a memória antes de publicar.

**Why this priority**: Protege os ganhos; não muda nada para o usuário diretamente.

**Independent Test**: Rodar o teste automatizado de memória e obter o relatório com os mesmos
cenários da linha de base.

**Acceptance Scenarios**:

1. **Given** o teste automatizado de memória, **When** ele roda no Windows, **Then** gera a tabela
   com os cenários da linha de base e falha se alguma meta desta spec for ultrapassada.

### Edge Cases

- Usuário com histórico configurado acima do padrão (ex.: 50.000 linhas): a memória cresce na
  proporção, mas fechar a aba ainda devolve tudo.
- Aba em segundo plano recebendo saída o tempo todo: o conteúdo tem que estar certo ao voltar, sem
  perder linhas dentro do limite do histórico.
- Painéis divididos (até 4 visíveis): todos os visíveis contam como "na tela" e mantêm a qualidade
  de desenho.
- Máquina sem aceleração gráfica: o terminal continua funcionando no modo de desenho simples.
- Reconexão automática numa aba em segundo plano: não pode recriar o terminal nem perder o histórico.
- Fechar o app com muitas abas: fecha em até 2 s como hoje.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-1401**: Depois de abrir, criar ou trocar a senha do cofre, o app MUST devolver ao sistema
  a memória usada pela proteção da senha mestra em até 5 s, sem reduzir a força dessa proteção.
- **FR-1402**: Fechar uma aba de terminal (SSH ou local) MUST liberar todos os recursos dela na
  interface e no processo principal: texto, histórico, desenho acelerado, ouvintes de eventos,
  temporizadores e filas de dados.
- **FR-1403**: Abas que não estão na tela MUST deixar de desenhar e de ocupar recursos de desenho
  acelerado; a saída que chegar enquanto isso MUST continuar indo para o histórico e aparecer certa
  ao voltar.
- **FR-1404**: Recursos opcionais do terminal (busca, links clicáveis, desenho acelerado) MUST ser
  carregados só quando usados ou quando a aba está na tela, desde que isso não atrase a troca de
  aba além de 100 ms.
- **FR-1405**: A saída recebida do servidor MUST ser repassada à interface em lotes com limite de
  tamanho e de frequência, para que saída intensa não acumule filas sem limite.
- **FR-1406**: O histórico padrão MUST continuar sendo de pelo menos 10.000 linhas por aba
  (FR-015); o limite configurado pelo usuário MUST ser respeitado e é o teto de memória do texto.
- **FR-1407**: O app MUST manter um teto de memória do processo principal adequado a um app de
  desktop, devolvendo memória ociosa ao sistema.
- **FR-1408**: Nenhuma funcionalidade existente pode mudar de comportamento visível: aparência,
  busca, seleção, copiar/colar, troca de aba < 100 ms (SC-112), painéis divididos, reconexão.
- **FR-1409**: O projeto MUST ter um teste automatizado de memória no Windows que reproduz os
  cenários da linha de base, grava o relatório e falha ao ultrapassar as metas de SC-1401 a SC-1405.
- **FR-1410**: Medições e relatórios MUST não conter dados do cofre (nomes de host, endereços,
  usuários, senhas, chaves); usam só terminais locais e números.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1401**: Com o cofre aberto e nenhuma aba, a memória total do app fica em ≤ 300 MB 10 s
  depois de abrir o cofre (linha de base: 560 MB).
- **SC-1402**: O custo médio por aba de terminal ociosa cai pelo menos 40% (linha de base: ~25 MB;
  meta: ≤ 15 MB).
- **SC-1403**: Depois de abrir e fechar 20 terminais, a memória volta a no máximo +30 MB do repouso
  em até 30 s (linha de base: +235 MB); 3 ciclos seguidos não somam mais que +15 MB entre si.
- **SC-1404**: Com 5 minutos de saída contínua, a memória da interface varia no máximo 10 MB entre o
  minuto 2 e o minuto 5.
- **SC-1405**: Troca de aba continua abaixo de 100 ms (p95) com 20 abas e uma com saída contínua.
- **SC-1406**: Nenhum teste existente de terminal, histórico, busca, copiar/colar ou painéis
  regride.

## Assumptions

- A meta é medida no Windows (onde o usuário relatou e onde a tela embutida pesa mais); macOS e
  Linux recebem as mesmas mudanças e são conferidos sem meta numérica nesta feature.
- Os números vêm do build de teste; o build de publicação pesa igual ou menos.
- Os shells e programas abertos pelo usuário ficam fora da conta.
- A força da proteção da senha mestra não muda (mesmos parâmetros); só a memória é devolvida antes.
- O fluxo de dados entre processo principal e interface pode mudar internamente, sem mudar o que o
  usuário vê.
- Trabalho dividido: interface (terminal, abas) com o Claude; processo principal (cofre, sessões,
  repasse de saída) com o Codex pela fila.

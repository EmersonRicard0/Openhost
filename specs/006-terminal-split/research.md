# Pesquisa: grupos de terminais (tela dividida)

Decisões técnicas da feature 006 ([spec](./spec.md)).

## R1. Onde o grupo vive

**Decisão**: só no frontend. O store `useSessions` continua com a lista `tabs` (uma entrada por
sessão) e ganha `groups: Record<string, Group>` com a árvore de divisões. `activeId` continua
sendo o id de **uma sessão**: quando ela está num grupo, a aba do grupo é a ativa e aquele
painel tem o foco. A barra de abas é derivada: percorre `tabs` em ordem e mostra cada sessão
avulsa, e cada grupo uma vez, na posição do seu primeiro membro.

**Motivo**: o processo Go já trata cada sessão de forma independente (dados, estado,
redimensionamento por `sessions.resize`); agrupar é só disposição na tela. Manter `activeId`
como sessão faz busca, copiar/colar, zoom, enviar teclas e "fechar aba" mirarem o painel ativo
sem mudar esses comandos (FR-606).

**Alternativas**: tornar a aba uma entidade nova que contém sessões — rejeitada: mudaria todos os
consumidores de `Tab`; guardar o layout no Go — rejeitada: não há o que o backend faça com ele, e
layouts não são salvos (Assumptions).

## R2. Layout: árvore binária com proporções

**Decisão**: `Node = Leaf { sessionId } | Split { dir: 'row' | 'column', ratio: number, a: Node,
b: Node }`. Soltar à esquerda/direita cria `Split row`, em cima/embaixo `Split column`, com
`ratio = 0,5` dividindo o painel de destino (FR-603). Funções puras em
`frontend/src/features/terminal/layout.ts`: `insert`, `remove` (o irmão sobe no lugar do pai),
`move`, `setRatio`, `equalize`, `leaves`, `rects` (retângulos em frações 0–1), `neighbor(id,
direção)` e `canSplit(rect, lado, mínimo)`.

**Motivo**: uma árvore binária cobre todas as disposições de até 4 painéis (2×2, 1+3, 3 colunas
etc.) e torna remoção e redimensionamento locais.

**Alternativas**: grade fixa 2×2 — rejeitada: não permite 3 colunas nem "um grande e dois
pequenos".

## R3. Renderização sem remontar terminais

**Decisão**: os `TerminalView` continuam numa lista plana no `Workspace`, um por sessão, cada um
absolutamente posicionado. Para sessões em grupo, o estilo vem de `rects()` do layout
(`left/top/width/height` em porcentagem, com o espaço da divisória descontado); sessões fora da
aba ativa ficam ocultas como hoje. As divisórias são elementos à parte, sobrepostos, também
posicionados por `rects()`. A prop `active` do `TerminalView` se divide em `visible` (pode
medir e redimensionar) e `focused` (recebe o teclado, destaque).

**Motivo**: React remontaria o xterm se o terminal mudasse de pai na árvore DOM; posicionando por
coordenadas, juntar, separar e reorganizar nunca destroem o terminal (FR-605, SC-602). O
`ResizeObserver` já existente em cada `TerminalView` faz o `fit` e chama `sessions.resize`
quando o painel muda de tamanho (FR-609).

## R4. Arrastar e soltar

**Decisão**: continua o arrastar nativo de HTML já usado pelas abas
(`application/x-shellvault-tab`). Durante um arrasto, uma camada transparente cobre a área dos
terminais (o xterm não recebe `dragover`) e calcula, para o painel sob o ponteiro, a borda mais
próxima (distâncias normalizadas pelo tamanho do painel); a prévia ocupa a metade
correspondente. Regras de recusa (FR-604) vêm de uma função pura `dropVerdict(origem, destino,
lado)` → `ok | full | group | sftp | tooSmall | self`, e a dica mostra o motivo. O cabeçalho do
painel é arrastável com o tipo `application/x-shellvault-pane` para reorganizar (FR-615) e para
separar ao soltar na barra de abas (FR-612).

**Alternativas**: biblioteca de layout (ex.: `react-mosaic`, `dockview`) — rejeitada
(Princípio V): traz o próprio arrasto e remonta filhos ao mudar a árvore.

## R5. Mínimo e divisórias

**Decisão**: mínimo de 20 colunas × 5 linhas por painel, convertido em pixels pela célula atual
do xterm do painel de destino (com 24 px de cabeçalho). Divisória de 6 px (área de pegar), linha
visível de 1 px, cursor `col-resize`/`row-resize`, arrasto por eventos de ponteiro com
`setPointerCapture`; o `ratio` é limitado para nenhum lado ficar abaixo do mínimo. Dois cliques
chamam `equalize` naquele nó (FR-608). Durante o arrasto, o `fit` acontece a cada quadro de
animação; `sessions.resize` só é enviado quando o tamanho em células muda (já é assim).

## R6. Atalhos de foco

**Decisão**: quatro ações novas no mapa de atalhos (`focusLeft`, `focusRight`, `focusUp`,
`focusDown`). Padrão Windows/Linux: `Ctrl+Alt+Seta`; macOS: `⌥⌘+Seta`. `Alt+Seta` (padrão de
outros terminais) fica de fora porque o readline e o PSReadLine usam `Alt` para pular palavras;
`Ctrl+Shift+Seta` é seleção por palavra no PSReadLine. Configuráveis como os demais (FR-607).

## R7. Fechar

**Decisão**: "fechar aba" (atalho e menu) com um grupo ativo fecha o **painel ativo**; o botão
× da aba do grupo fecha todas as sessões, com o diálogo de confirmação existente mostrando a
contagem de sessões vivas (FR-613). Quando sobra uma sessão, o grupo é removido e ela vira aba
comum (FR-614).

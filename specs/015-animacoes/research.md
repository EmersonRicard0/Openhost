# Research: Animações (015)

## R1 — Mostrar a marca desde o primeiro quadro

**Decision**: a tela de abertura (fundo preto piano + chevron) fica **no `index.html`**, em HTML e
CSS inline, fora do React, opaca em `#050505` (`--brand-preto-piano`). A janela nativa continua
transparente (Mica, necessário para o modo vidro). O React remove a abertura quando a primeira tela monta.

**Rationale**: `main.tsx` espera `loadUi()` e os perfis (até 5 s) antes de renderizar; qualquer
animação feita em React só apareceria depois disso. HTML/CSS inline é pintado pelo WebView antes de
qualquer JS. A CSP já permite `style-src 'unsafe-inline'`; não precisa de script inline (proibido
por `script-src 'self'`). Um fundo nativo opaco foi descartado: `WindowIsTranslucent` + Mica exigem alfa 0, e antes do WebView
pintar o que aparece é o Mica do sistema, não branco (SC-1502 conferido em gravação).

**Alternatives considered**: tela de abertura nativa do Wails (não existe na v2); renderizar o
React antes de `loadUi` (muda a ordem de carga que a 014 mede e arrisca terminal com fonte errada);
imagem PNG (pesa mais que um SVG inline de ~1 KB e não anima).

## R2 — Preferência de animação antes do JS

**Decision**: a entrada do símbolo segue só `prefers-reduced-motion` do sistema (CSS `@media`).
A preferência do usuário (Completas/Reduzidas/Desligadas) vale a partir do momento em que o React
lê as preferências — o que já acontece antes de a primeira tela entrar.

**Rationale**: sem script inline não dá para ler a preferência antes do primeiro quadro; a entrada
dura até 600 ms e é interrompida quando a tela fica pronta, então o efeito de ignorar a preferência
nesse trecho é mínimo e nunca atrasa nada.

**Alternatives considered**: script externo pequeno lendo `localStorage` (mais um arquivo na carga
e uma cópia da preferência fora do Go).

## R3 — Três níveis de movimento

**Decision**: atributo `data-motion` em `<html>` com `full`, `reduced` ou `off`, resolvido de
`preferences.motion` (`system` | `full` | `reduced` | `off`) + `matchMedia('(prefers-reduced-motion:
reduce)')`. Em `global.css`:
- `off`: `--motion-*` = `0ms` (como o `@media` atual);
- `reduced`: durações mantidas e `--motion-shift: 0` — keyframes e transições de deslocamento/escala
  usam `calc(var(--motion-shift) * …)`, então só cor e opacidade se movem.
Os `@media (prefers-reduced-motion)` espalhados nos módulos viram seletores `[data-motion]`.

**Rationale**: um ponto único de decisão; os componentes não precisam saber o nível, só usar os
tokens. Mantém a regra da FR-170.

**Alternatives considered**: classe por componente (espalha a decisão); biblioteca de animação
(dependência nova sem necessidade; Princípio V).

## R4 — Onde guardar a preferência

**Decision**: campo novo `motion` em `appwin.Preferences` (Go), padrão `"system"`, normalizado para
os quatro valores, **fora** de `SyncPreferences` (vale só neste computador, FR-1518). Exposto pela
mesma `AppService.GetPreferences/UpdatePreferences` de hoje.

**Rationale**: é o caminho de `hostDensity`/`gpuRendering`. Mudança Go pequena (cartão para o
Codex).

## R5 — Retorno de clique sem custo

**Decision**: estado de pressionado por CSS `:active` (e `[data-pressed]` para Enter/espaço via um
handler único em `ui/`), com `transform: scale(calc(1 - 0.03 * var(--motion-shift)))` e mudança de
fundo. Só `transform`/`opacity`/`background-color` — nada que dispare layout.

**Rationale**: `:active` é aplicado pelo navegador no mesmo quadro do clique, sem JS (SC-1503 mesmo
com a thread de JS ocupada com saída de terminal).

## R6 — Ações demoradas sem clique duplicado

**Decision**: `data-busy` + `aria-busy` no elemento enquanto a promessa da ação está pendente, via
um hook `useBusyAction` em `ui/`; o segundo clique com a ação pendente é ignorado. Hoje `features/hosts/connect.ts` não tem trava
contra conexão dupla; o hook passa a ser a regra única (conectar, salvar, importar, exportar,
sincronizar agora).

## R7 — Terminal: aba, painel, conexão

**Decision**:
- **Aba nova**: keyframe de entrada (largura + opacidade) no elemento da aba; o terminal monta e
  recebe foco no mesmo commit, sem esperar `animationend` (FR-1501/1502).
- **Fechar aba**: reaproveitar `leaveGhost` (já existe em `ui/motion.ts`) para a aba fechada
  encolher; as vizinhas deslizam pela transição de `transform` do indicador já existente.
- **Dividir**: o painel novo anima `flex-grow` de 0 até o valor final; o `ResizeObserver` do
  terminal ignora os quadros intermediários e faz **um** `fit()` no `transitionend` (ou num teto de
  `--motion-slow` + 50 ms) — SC-1505.
- **Conectando**: sobreposição com o chevron pulsando enquanto `state === 'connecting'` e nenhum
  byte chegou; some no primeiro `data`, num pedido (`hostkey`/`prompt`) ou erro.

**Rationale**: tudo dentro de elementos que já existem; entrada nunca passa por animação.

## R8 — Medição (SC-1501, SC-1506)

**Decision**: reutilizar o método da 014: build e2e com e sem animação (`data-motion="off"` forçado
por variável de ambiente de teste), 10 aberturas, tempo até `#unlock-password` aceitar foco. CPU em
repouso minimizado comparada na mesma rodada.

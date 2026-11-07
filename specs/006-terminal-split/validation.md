# Validação: grupos de terminais (006)

Data: 2026-10-26 · Branch `006-terminal-split` · Windows 11

## §1 Lógica do layout e do store — ✅

`npx vitest run` → 160 testes verdes (layout: inserção nos quatro lados, remoção, mover,
proporções limitadas, mínimo por subárvore, `neighbor` em 2×2 e "1 grande + 2", `dropVerdict`;
store: juntar, limite de 4, SFTP recusado, reorganizar, separar, grupo desfeito com uma sessão,
fechar mantendo o foco no grupo, reordenar o grupo em bloco, próxima aba por item, fechar a
aba do grupo com uma confirmação só).

## §2 Ponta a ponta — ✅ (cenário 6 por teste de unidade)

`npx playwright test tests/e2e/split.spec.ts` → 3 testes verdes:

1. Juntar dois `cmd` à direita: mesmo id de sessão, `echo` nos dois, `ServerSizeOf` = xterm.
2. 2×2 com quatro sessões; a quinta mostra "Máximo de 4 sessões por grupo", sem prévia, e nada
   muda.
3. Divisória arrastada: colunas mudam e o servidor acompanha nos dois painéis; dois cliques
   igualam; seta muda 5%.
4. `Ctrl+Alt+←/→` move o foco; a digitação vai só para o painel `data-focused`.
5. Reorganizar pelo cabeçalho; "Separar em nova aba" mantém id e conteúdo; "Fechar painel"
   encerra só aquela sessão e o grupo com uma sessão volta a ser aba comum.
6. Confirmação única ao fechar a aba do grupo com SSH ativa: coberta em `sessions.test.ts`
   (o e2e não tem servidor SSH neste cenário).

Regressão: `local-terminal`, `ui-polish`, `close-confirm`, `terminal-render`, `daily-use`,
`menus`, `personalization` verdes.

Achados corrigidos durante a validação:

- Teclas digitadas rápido chegavam fora de ordem ao shell (cada escrita era uma chamada
  assíncrona independente); as escritas agora são serializadas por sessão.
- O xterm de um painel podia passar da borda até o próximo `fit` e cobrir o cabeçalho do painel
  de baixo; o painel recorta o conteúdo.

## §3 Manual com SSH real — ⏳ pendente do usuário

Juntar 4 sessões SSH, redimensionar a janela e a barra lateral, rodar `htop`/`top` em cada
painel e conferir que todos redesenham no tamanho certo.

## Pendência de backend

Remapear os atalhos de foco nas configurações depende do cartão `63-006SHORTCUTS` (lista de
ações aceitas em `internal/appwin/preferences.go`); os padrões funcionam sem ele.

# Validação: grupos de terminais

Contrato em [contracts/ui.md](./contracts/ui.md); modelo em [data-model.md](./data-model.md).

## 1. Lógica do layout

```bash
cd frontend && npx vitest run src/features/terminal/layout.test.ts src/stores/sessions.test.ts
```

Esperado: inserção nos quatro lados, remoção com irmão subindo, limite de 4, recusas de
`dropVerdict`, `neighbor` nas quatro direções num 2×2 e num "1 grande + 2", proporções
limitadas pelo mínimo, barra de abas derivada na ordem certa.

## 2. Ponta a ponta (app real, terminais locais)

```bash
cd frontend && npx playwright test tests/e2e/split.spec.ts
```

Cenários:

1. Abrir dois `cmd`, arrastar a aba do segundo sobre o terminal do primeiro, metade direita:
   uma aba só, dois painéis lado a lado; os dois aceitam `echo` e mostram a saída; o id de sessão
   de cada um é o mesmo de antes (não reconectou).
2. Repetir até 4; a quinta mostra "Máximo de 4 sessões por grupo" e nada muda.
3. Arrastar a divisória: o tamanho do servidor (`ServerSizeOf`, como em `ui-polish.spec.ts`)
   acompanha o do xterm em cada painel.
4. `Ctrl+Alt+→`/`←`/`↑`/`↓` move o foco; digitar vai para o painel com `data-focused`.
5. "Separar em nova aba" devolve a sessão a uma aba própria com o mesmo conteúdo; fechar um
   painel encerra só aquela sessão; com uma sessão restante, a aba volta a ser comum.
6. Fechar a aba do grupo com duas sessões SSH ativas mostra uma confirmação com "2 sessões".

## 3. Manual

Com sessões SSH reais: juntar 4, redimensionar a janela e a barra lateral, rodar `htop`/`top` em
cada painel e conferir que todos redesenham no tamanho certo. Registrar em `validation.md`.

# Quickstart: validar as animações (015)

Pré-requisitos: Docker ligado (sshd de teste: `node scripts/sshd.mjs up`), `npm ci` em `frontend/`.
O e2e abre o app e pega o foco da tela: avisar o usuário antes.

## Automático

```
cd frontend
npm run lint && npm run typecheck && npx vitest run && node ../scripts/check-tokens.mjs
npx playwright test tests/e2e/motion.spec.ts
npx playwright test tests/e2e/noc-ui.spec.ts tests/e2e/split.spec.ts tests/e2e/ui-polish.spec.ts
go test ./internal/appwin/
```

## Cenários

1. **Abertura (US1, SC-1501/1502)**: abrir 10 vezes com `motion` = `full` e 10 com `off`; o tempo até o
   campo de senha aceitar digitação difere ≤ 20 ms; nenhuma captura do primeiro quadro é branca.
2. **Tela pronta antes da entrada (FR-1506)**: com o cofre pequeno, a tela de senha substitui o
   símbolo antes de 600 ms e o campo já tem foco.
3. **Clique (US2, SC-1503)**: com uma aba rodando `yes`, clicar num host e num botão: `:active`
   aplicado no quadro seguinte; conectar duas vezes seguidas abre uma sessão só.
4. **Aba nova + digitação (US3, SC-1504)**: 20 vezes abrir aba local e digitar `echo ok` na hora;
   100% chegam.
5. **Dividir (SC-1505)**: dividir um painel e contar `resize` da sessão: 1.
6. **Conectando (FR-1512)**: conectar no sshd: indicador visível até o pedido da chave; com host
   inexistente, some ao mostrar o erro.
7. **Fechar aba**: fechar a aba do meio de 5; as da direita deslizam e a ordem final é a mesma.
8. **Preferência (US5, SC-1507)**: `Desligadas` → nenhuma `animation-name`/`transition-duration`
   diferente de `0s` em elementos visíveis; `Reduzidas` → nenhum `transform` animado; continua após
   reiniciar e não aparece na sincronização.

## Resultados (2026-11-07, Windows 11, build e2e)

- **SC-1501** (`tests/e2e/motion-perf.spec.ts`, marca `openhost:first-screen`): Desligadas
  393 ms em média, Completas 405 ms → **+12 ms** (limite 20). Variação entre aberturas ±50 ms.
- **SC-1504**: 20/20 abas receberam `echo` digitado logo ao abrir.
- **SC-1505**: dividir com animação → 1 `resize` por terminal.
- **SC-1507**: Desligadas → nenhuma duração ≠ 0; Reduzidas → `--motion-shift: 0`.
- Suíte e2e completa: 88/90; `memory.spec` (meta 014 de +15 MB em 3 ciclos) falha também na
  `main` (+16 MB) e oscila na 015 (+44 a +58 MB, quase tudo memória da GPU, mesmo sem a animação
  das abas); `process.spec` falhou uma vez por foco e passou na repetição.

# Quickstart — validar a 014

Pré-requisito: Windows, dependências do frontend instaladas, Go e Wails. Sem Docker (só terminais
locais).

1. Testes Go: `go test ./internal/session/... ./internal/vault/...` (pausa/retomada, expiração,
   fechar pausado; devolução de memória após derivação).
2. Vitest: `npm --prefix frontend run test` (fila de escrita com marcas alta/baixa, backlog do
   dataBus com teto e descarte de sessão fechada).
3. Memória: `npx playwright test tests/e2e/memory.spec.ts` dentro de `frontend/`.
   - Esperado: relatório em `frontend/test-results/memory.md` com os cenários da linha de base e
     todas as metas SC-1401..SC-1404 dentro do limite.
4. Regressão: `npx playwright test tests/e2e/performance.spec.ts tests/e2e/terminal-render.spec.ts
   tests/e2e/noc.spec.ts` (troca de aba < 100 ms, cores/histórico, copiar/colar, painéis).
5. Manual: abrir 10 abas, despejar `1..1000000` numa delas, trocar de aba e digitar nas outras sem
   atraso; fechar tudo e ver no Gerenciador de Tarefas a memória voltar perto do início.

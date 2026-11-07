# Validação: 012 — Digitar no grupo e comandos salvos

Data: 2026-11-06 · Windows 11 · build e2e (`-tags e2e`) · branch `012-broadcast-snippets`

## Verificações automáticas (T025)

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` (app e testes) | ok |
| `npx eslint` nos arquivos alterados | ok |
| `npx vitest run` | 32 arquivos, 259 testes, todos passam |
| `go test` em `domain`, `cloudsync`, `importer`, `exporter`, `bridge` | ok |

## Cenários do quickstart (`tests/e2e/broadcast-snippets.spec.ts`)

| # | Cenário | Resultado |
|---|---|---|
| 1 | Digitar no grupo (US1) — 3 CMD, desmarcar, trocar ativo, separar, atalho | passa |
| 2–3 | Produção e colagem no grupo (US2) | **pendente**: precisa do servidor SSH de teste (Docker desligado nesta máquina; o teste para em "Confirme a chave do servidor") |
| 4 | Biblioteca (US3): escreve sem executar, executa quando marcado, continua após bloquear | passa |
| 5 | Campos (US4): vazio recusado, `100-100`, `{{x}}` → `{x}`, reabre preenchido | passa |
| 6 | Grupo (US5): Shift+Enter nos conectados, aviso "1 painel desconectado não recebeu" | passa |
| 6 | Tags (US5): host `huawei` põe os comandos `huawei` primeiro | coberto por `rankSnippets` no vitest |
| 7 | Exportar/importar (US6): comandos no `.openhost`, prévia, resumo, lista no cofre novo | passa |

Rodar de novo 2–3 com `node scripts/sshd.mjs up` antes de fechar a feature.

## Critérios de sucesso

| SC | Meta | Medido | Como |
|---|---|---|---|
| SC-1201 | 4 sessões, 50 comandos, sem perda | coberto em parte pelo cenário 1 (3 sessões) | — |
| SC-1202 | receptor < 50 ms além do ativo | mediana 0 ms, p95 1,4 ms, máx 1,7 ms (30 amostras, 2 CMD) | `tests/e2e/broadcast-perf.spec.ts` |
| SC-1203 | nada fora do grupo, desmarcado ou produção sem confirmação | cenários 1 e 6 + revisão abaixo; produção no cenário 2 (pendente SSH) | — |
| SC-1205 | < 100 ms por tecla com 500 comandos | mediana 6,4 ms, máx 8,9 ms (7 teclas, keydown → lista atualizada) | `tests/e2e/broadcast-perf.spec.ts` |
| SC-1206 | exportar/importar preserva 100% | cenário 7 (1 comando) + testes Go do exportador/importador | — |

Os números ficam em `frontend/test-results/012-medicoes.json` a cada execução.

## Revisão de segurança (T024)

- **Ponte**: `SnippetService` valida `id` como UUID antes de qualquer acesso; criação e edição
  passam por `domain.CreateSnippet`/`UpdateSnippet`, que devolvem `apperr` sem o texto do comando
  (nome repetido vira `ALREADY_EXISTS`, campo inválido vira `INVALID_FIELD` com o nome do campo).
- **Logs e erros**: nenhum `console.*` nem log Go com texto de comando ou valor de campo; os toasts
  mostram só a mensagem do erro.
- **Disco**: comandos ficam cifrados no cofre como as demais linhas. Os valores dos campos ficam só
  em memória (`useSnippets.lastValues`) e somem ao bloquear; nada vai para `localStorage`.
- **Exportação**: sem chaves o `.openhost` sai em texto puro. O aviso do diálogo agora diz que os
  **comandos salvos** também ficam legíveis quando "Incluir comandos" está marcado (corrigido nesta
  revisão).
- **Caminhos de envio**: o comando usa `writer.send`, que escreve só na sessão pedida, sem o
  espelhamento do "Digitar no grupo". "Enviar ao painel" vai só ao ativo. "Enviar ao grupo"
  usa os membros do grupo do painel ativo, tira os desmarcados, pula os desconectados (com aviso)
  e, havendo painel de Produção, só envia depois do diálogo de confirmação, que lista os painéis
  na hora do clique (sem janela entre confirmar e enviar).
- **Nuvem**: `snippet:<id>` passa por `decodeStrict`, UUID, datas válidas e
  `domain.ValidateSnippet`; item de tipo conhecido inválido é recusado, tipo desconhecido é
  ignorado e preservado (R6).

# Linha de base de memória — 2026-11-06

Windows 11 Pro 10.0.26200, build de teste (`-tags e2e`), commit `fb61346`. Memória privada
(PrivatePageCount) somada por nome de processo na árvore do app; "Interface" é o heap JS usado
pela tela. Cada medida depois de 3 s de espera. Terminais locais PowerShell, sem dados do cofre.

| Cenário | Principal (MB) | WebView2 x6 (MB) | Heap JS (MB) | Shells (fora da meta) |
|---|---|---|---|---|
| Cofre aberto, sem abas | 313 | 247 | 7 | — |
| 5 terminais locais | 315 | 401 | 18 | 275 |
| 20 terminais locais | 320 | 740 | 47 | 1.109 |
| 20 abas, 1 com 60 s de saída contínua | 68 | 662 | 86 | 1.096 |
| Depois de fechar as 20 + GC forçado (10 s) | 65 | 482 | 29 | — |

Observações:

- O processo principal cai de ~315 para ~65 MB sozinho alguns minutos depois: o pico é a memória
  da derivação Argon2id da senha mestra ainda não devolvida ao sistema.
- Custo por aba na tela embutida: (740 − 247) / 20 ≈ 25 MB.
- Depois de fechar todas as abas não há nenhum `.xterm` no DOM, mas a tela embutida segue 235 MB
  acima do início e o heap JS 22 MB acima → memória retida.

Medido com o teste temporário `frontend/tests/e2e/zz-mem-baseline.spec.ts` (vira o teste de
FR-1409 na implementação).

## Variação entre execuções (T002)

`memory.spec.ts` rodado três vezes seguidas em 2026-11-06, já com o renderer DOM por padrão e o
pool de WebGL (commit `253d3bd`). "Tela embutida" = soma dos processos WebView2.

| Medida | Rodada 1 | Rodada 2 | Rodada 3 | Faixa |
|---|---|---|---|---|
| Custo por aba na tela embutida (MB) | 3,8 | 4,1 | 3,7 | 0,4 |
| Repouso, app total (MB) | 529 | 530 | 525 | 5 |
| Repouso, tela embutida (MB) | 215 | 215 | 212 | 3 |
| Fechou as 20, ciclo 1, tela embutida (MB) | 228 | 229 | 230 | 2 |
| Fechou as 20, ciclo 3, tela embutida (MB) | 227 | 233 | 229 | 6 |
| Saída contínua, minuto 5, tela embutida (MB) | 268 | 284 | 265 | 19 |
| Saída contínua, minuto 5, heap JS (MB) | 24 | 24 | 24 | 0 |

Margem de ruído adotada nas metas (T023): **±5 MB** para repouso, por aba e depois de fechar;
**±20 MB** para saída contínua (o GPU e o renderer oscilam com o que está na tela no instante da
leitura); heap JS estável.

Com isso, contra a linha de base acima: custo por aba caiu de ~25 MB para ~4 MB (−84%) e fechar
as 20 abas volta a +13–18 MB do repouso (antes +235 MB). O repouso total ainda passa da meta de
300 MB por causa do processo principal (~313 MB do Argon2id), que depende da T008 do Codex.

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

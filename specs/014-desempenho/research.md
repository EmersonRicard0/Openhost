# Research — 014 desempenho

Medições em [baseline.md](./baseline.md). Segunda rodada separando os processos da tela embutida
por tipo (`--type=`):

| Cenário | GPU | Renderer | Principal | Heap JS |
|---|---|---|---|---|
| Sem abas | 141 | 45 | 315 | 7 |
| 5 terminais | 252 | 87 | 316 | 18 |
| 20 terminais | 505 | 166 | 319 | 49 |
| 20 + 60 s de saída | 362 | 241 | 70 | 87 |
| Fechadas + GC | 306 | 121 | 70 | 32 |

O processo de GPU é o maior consumidor: +18 MB por aba aberta **embora só uma esteja na tela**, e
fica +165 MB depois de fechar todas.

## R1 — Pico do Argon2id no processo principal

- **Decision**: depois de cada derivação da senha mestra (abrir, criar, trocar senha, abrir cofre
  da nuvem) chamar `debug.FreeOSMemory()` numa goroutine, fora do lock do cofre. Ao iniciar,
  `debug.SetMemoryLimit(256 MiB)` como limite *suave* (o GC trabalha mais perto do limite; não mata
  o app se passar).
- **Rationale**: a derivação usa 256 MiB por projeto (força da senha, Princípio II). O Go guarda a
  memória livre e só a devolve ao sistema após minutos (scavenger); medido 313 → 65 MB sozinho.
  Forçar a devolução custa ~10 ms uma vez por desbloqueio.
- **Alternatives**: reduzir a memória do Argon2 (rejeitado: enfraquece o cofre); `GOGC` menor
  (rejeitado: mais CPU o tempo todo, não resolve o pico).

## R2 — Contextos WebGL vazando no processo de GPU

- **Decision**: (a) ao esconder ou fechar um terminal, antes de `dispose()` do addon WebGL, chamar
  `WEBGL_lose_context.loseContext()` no contexto do canvas dele; (b) não recriar o renderer a cada
  troca: manter o WebGL dos terminais visíveis e de no máximo **1 terminal recém-escondido** (volta
  instantânea para a aba anterior), liberando os outros; (c) comparar por medição com o renderer
  DOM puro: se o DOM ficar dentro de SC-1405 e economizar mais, ele vira o padrão e o WebGL fica
  como opção em Configurações.
- **Rationale**: o `@xterm/addon-webgl` 0.19 não chama `loseContext` no `dispose`; o Chromium só
  libera o contexto quando o canvas é coletado, e cada troca de aba cria outro. Isso bate com +18 MB
  por aba no GPU e com a sobra depois de fechar.
- **Alternatives**: deixar o WebGL carregado em todas as abas (rejeitado: limite de 16 contextos do
  Chromium, research R4 da 001); só renderer DOM sem medir (adiado para a medição do item c).

## R3 — Memória da interface retida depois de fechar

- **Decision**: (a) `dataBus`: saída de sessão sem terminal montado só é guardada para sessões
  ainda abertas, com teto de 1 MiB por sessão; sessão fechada descarta o que chegar; trocar o
  `[...lista, dado]` (quadrático) por `push`; (b) investigar com dois heap snapshots (antes de abrir
  e depois de fechar 20 abas) e corrigir cada retenção encontrada (registro de terminais, sonda de
  teste, observador de prompt, store de sessões, decorações da busca); (c) teste de regressão que
  falha se o heap após 3 ciclos crescer acima do teto.
- **Rationale**: 0 terminais no DOM e ainda +22 MB de heap = referências presas em JS.
- **Alternatives**: recarregar a página periodicamente (rejeitado: perde estado).

## R4 — Saída intensa: controle de fluxo

- **Decision**: controle de fluxo por crédito entre interface e processo principal. A interface
  conta os bytes entregues ao terminal e ainda não processados (callback do `write`); acima de
  **2 MiB pendentes** chama `sessions.pause(id)`; abaixo de **512 KiB** chama `sessions.resume(id)`.
  No Go, pausar faz o leitor da sessão parar de ler do PTY/canal SSH (o próprio sistema/TCP segura o
  programa remoto). Pausa automática expira em 30 s por segurança.
- **Rationale**: o Go já agrupa a saída (Batcher, 8 ms / 32 KiB), mas sem retorno da interface o
  terminal acumula fila interna quando o processamento não acompanha (heap 47 → 87 MB em 60 s).
  É o padrão recomendado pela documentação de fluxo do xterm (marcas alta/baixa).
- **Alternatives**: descartar saída (rejeitado: perde dados); só aumentar o lote (não limita).

## R5 — Addons e custo fixo por aba

- **Decision**: `SearchAddon` carregado na primeira busca da aba; `WebLinksAddon` e `Unicode11`
  continuam (baratos e necessários desde o início). Medir custo de cada um no heap snapshot de R3.
- **Rationale**: menos objetos por aba ociosa; a busca é rara.

## R6 — Histórico

- **Decision**: mantém o padrão atual e o mínimo de 10.000 linhas (FR-015). O buffer do xterm
  cresce sob demanda; não é o custo de uma aba ociosa.

## R7 — Teste de memória (FR-1409)

- **Decision**: `frontend/tests/e2e/memory.spec.ts`, só Windows (como os demais e2e), mede a árvore
  de processos do app via `Win32_Process` agrupando por `--type`, e o heap JS via
  `performance.memory` + `HeapProfiler.collectGarbage` (CDP). Grava `test-results/memory.md` e
  falha acima das metas SC-1401..SC-1404. Usa só terminais locais (FR-1410).
- **Rationale**: o protótipo usado na linha de base já funciona; vira teste com metas.

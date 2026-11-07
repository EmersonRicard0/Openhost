# Implementation Plan: Menos memória e terminal mais leve

**Branch**: `014-desempenho` | **Date**: 2026-11-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/014-desempenho/spec.md`

## Summary

Reduzir a memória do OpenHost no Windows atacando as quatro causas medidas
([baseline.md](./baseline.md), [research.md](./research.md)): contextos WebGL que não são liberados
no processo de GPU (maior parte), pico do Argon2id não devolvido no processo principal, referências
presas na interface depois de fechar abas, e fila de escrita sem retorno com saída intensa (controle
de fluxo por pausa/retomada). Um teste e2e de memória com metas protege o resultado.

## Technical Context

**Language/Version**: Go (backend), TypeScript 5 + React 19 (frontend)
**Primary Dependencies**: Wails v2.17 (WebView2 no Windows), `@xterm/xterm` 6.0, `@xterm/addon-webgl`
0.19, `golang.org/x/crypto/argon2` — nenhuma dependência nova
**Storage**: N/A (sem mudança no cofre)
**Testing**: `go test`, Vitest, Playwright e2e sobre o app real (`-tags e2e`)
**Target Platform**: Windows (metas numéricas); macOS e Linux recebem as mesmas mudanças
**Project Type**: app desktop (Go + WebView)
**Performance Goals**: SC-1401..SC-1405 (repouso ≤ 300 MB; ≤ 15 MB/aba; +30 MB após fechar;
heap estável com saída contínua; troca de aba < 100 ms)
**Constraints**: força do Argon2 inalterada; histórico ≥ 10.000 linhas; nenhum comportamento
visível muda
**Scale/Scope**: até 20 abas abertas, 4 painéis visíveis

## Constitution Check

| Princípio | Verificação |
|---|---|
| I. Clean Room | Só documentação pública do xterm/Chromium/Go; sem código de terceiros copiado. ✅ |
| II. Segurança | Parâmetros do Argon2 iguais; devolver memória não expõe nada; métodos novos da ponte validam o id e não carregam dados; medições sem dados do cofre (FR-1410). Toca a ponte → revisão de segurança na tarefa final. ✅ |
| III. Local-First | Sem rede, sem mudança de formato. ✅ |
| IV. Testes Primeiro | Testes Go de pausa/retomada e Vitest da fila/backlog antes do código; teste e2e de memória como regressão do vazamento. ✅ |
| V. Simplicidade | Sem dependência nova; dois métodos de ponte justificados por R4; limite suave de memória é uma linha. ✅ |

Pós-design: sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/014-desempenho/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md · baseline.md
├── contracts/bridge.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
internal/session/        # Pause/Resume no leitor da sessão (Codex)
internal/vault/          # devolução de memória após derivação (Codex)
internal/bridge/         # SessionService.Pause/Resume (Codex)
main.go                  # limite suave de memória (Codex)
frontend/src/features/terminal/
├── TerminalView.tsx     # WebGL: loseContext, cache de 1 escondido, busca sob demanda, fila de escrita
├── webglPool.ts         # (novo) quem tem WebGL e libera os outros
├── writeQueue.ts        # (novo) marcas alta/baixa → pause/resume
└── dataBus.ts           # backlog com teto e descarte de sessão fechada
frontend/src/bridge/ · shared/ipc/api.ts   # sessions.pause/resume
frontend/tests/e2e/memory.spec.ts          # metas SC-1401..SC-1404
```

**Structure Decision**: mesma estrutura do app; dois módulos pequenos novos no frontend do terminal.

## Divisão

- **Codex (Go, fila)**: R1 e o lado Go de R4 (+ testes).
- **Claude (frontend)**: R2, R3, R5, lado frontend de R4, teste de memória R7, medição final.

## Complexity Tracking

Nenhuma violação.

# Contrato da ponte — 014

Dois métodos novos em `SessionService` (Go) / `window.shellvault.sessions` (frontend).

## `Pause(sessionId string) error` → `sessions.pause(sessionId)`

- Para de ler a saída da sessão até `Resume`, `Close` ou 30 s.
- Idempotente. Sessão inexistente ou fechada: retorna `nil` (a interface pode chamar depois de
  fechar sem erro).
- Validação no Go: `sessionId` no formato de id do app; nada mais é aceito.
- Não afeta entrada: o que o usuário digita continua sendo enviado.

## `Resume(sessionId string) error` → `sessions.resume(sessionId)`

- Volta a ler. Idempotente; mesmas regras de validação.

## Sem mudança

- Evento `term:data` (mesmo formato; o Batcher continua com 8 ms / 32 KiB).
- Nenhum dado do cofre trafega a mais.

## Interno (sem ponte)

- `vault`: após cada derivação da senha mestra, devolve a memória ao sistema (R1).
- `main`/inicialização: limite suave de memória do runtime (R1).

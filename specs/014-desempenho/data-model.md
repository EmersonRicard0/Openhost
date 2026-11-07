# Data model — 014 desempenho

Nenhuma mudança no cofre, no esquema SQL, na sincronização ou no formato de exportação.

## Estado em memória (novo)

### Fluxo da sessão (Go, `internal/session`)

| Campo | Tipo | Regra |
|---|---|---|
| `paused` | bool | `true` entre `Pause` e `Resume`; o leitor da sessão para de ler enquanto `true` |
| `pausedAt` | time | pausa expira sozinha em 30 s (evita sessão presa se a interface sumir) |

Transições: `running → paused` (Pause) · `paused → running` (Resume, expiração, Close) · qualquer
→ `closed` (Close libera o leitor mesmo pausado).

### Fila de escrita do terminal (frontend)

| Campo | Regra |
|---|---|
| `pendingBytes` | soma dos lotes passados a `term.write` cujo callback ainda não veio |
| marca alta | 2 MiB → pede `pause` (uma vez) |
| marca baixa | 512 KiB → pede `resume` (uma vez) |

### Backlog do dataBus (frontend)

Por sessão aberta sem terminal montado: lista de lotes, teto 1 MiB (excedente descarta os mais
antigos). Sessão fechada: backlog removido e novos lotes ignorados.

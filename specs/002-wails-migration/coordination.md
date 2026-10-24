# Coordenação entre agentes — 002-wails-migration

Dois agentes trabalham em paralelo. Para não pisar um no outro:

## Onde cada um trabalha

| Agente | Árvore de trabalho | Branch |
|---|---|---|
| Claude Code | `shellvault/` (esta pasta) | `002-wails-migration` |
| Codex | worktree `../shellvault-codex` | `002-codex-backend` |

Criar o worktree do Codex (uma vez):

```
git worktree add ../shellvault-codex -b 002-codex-backend 002-wails-migration
```

O Codex faz `git rebase 002-wails-migration` antes de começar cada tarefa e o Claude Code faz
o merge de `002-codex-backend` quando o Codex avisar que um bloco terminou (testes verdes).

## Tarefas

**Claude Code — frontend e aparência**
- US2: T043–T051
- US3 (frontend): T055, T059–T064
- US4 (frontend): T072–T076
- US5: T077–T087, T107–T114 (T077–T080 dependem do usuário)

**Codex — backend Go**
- US3: T052, T053, T054, T056, T057 (só a parte Go: `keepalive.go`, dial, `vault_settings`;
  o campo no diálogo fica com o Claude Code), T058
- US4: T065, T066, T067, T068, T069, T070, T071
- T113 (só a parte Go: `latencyMs` no `term:state` a partir do RTT do keepalive)

## Arquivos

- Codex não altera `frontend/` (exceto `frontend/src/shared/ipc/*` e `shared/model/types.ts`
  quando um método ou evento novo da ponte exigir; avisar no commit).
- Claude Code não altera `internal/sshx/`, `internal/schemes/`, `internal/fonts/`,
  `internal/domain/profiles*` enquanto as tarefas do Codex estiverem abertas.
- Arquivos compartilhados (`main.go`, `internal/bridge/services.go`, `go.mod`, `go.sum`,
  `specs/002-wails-migration/tasks.md`): mudanças mínimas; em `tasks.md` cada agente marca
  apenas as próprias linhas.
- Commits pequenos, uma tarefa por commit, mensagem com o ID da tarefa (padrão do histórico).

## Verificação antes de cada commit

- Go: `go vet ./...` e `go test ./...` (integração: `go test -tags integration ./internal/sshx/...`
  com `node scripts/sshd.mjs up`).
- Frontend: `npx tsc -b`, `npx eslint .`, `npx vitest run` em `frontend/`.

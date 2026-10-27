# Validação: sincronização pelo Google Drive (008)

## Revisão de segurança final (T028), 2026-10-27

- **Segredos fora da ponte**: `SyncInfo` só tem estado, disponibilidade, e-mail, nome do
  computador, data, contadores e motivo; `Connect` devolve só e-mail e `cloudHasVault`.
  `Conflicts` troca `password`, `passphrase` e `privateKey` por `"••••"` (são os únicos campos
  secretos de `model.*`); o e2e do cenário 6 confere que a senha do host não aparece no diálogo.
- **Logs**: nenhum `log`/`slog`/`fmt.Print` em `internal/cloudsync` nem em `internal/bridge/sync*.go`;
  nenhum `console`/`localStorage` em `frontend/src/features/sync` e `stores/sync.ts`. Erros
  passam por `apperr.Sanitize` antes da ponte.
- **OAuth**: listener `tcp4` em `127.0.0.1:0`, confere `state`, PKCE `S256`.
- **Argumentos do frontend**: nenhum vira URL ou caminho. IDs do Drive vêm das listagens e passam
  por `driveIDPattern`; `Drive.request` recusa caminho absoluto; `RestoreVersion` só aceita nomes
  da última listagem e `Resolve` só chaves de conflitos existentes.
- **Bytes na nuvem**: o e2e do cenário 1 confere que nenhum arquivo do Drive falso contém rótulo,
  endereço, usuário ou senha do host de teste.

Sem achados.

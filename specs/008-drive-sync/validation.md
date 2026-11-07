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

## Quickstart §1–§2 (T029), 2026-10-27

- `go test ./internal/cloudsync/... ./internal/vault/... ./internal/bridge/...`: ok.
- `npm run typecheck`, `npm run lint`: ok. `npm test`: 175 testes ok.
- E2e `sync.spec.ts` + `sync-devices.spec.ts` com o Drive falso: 9 passaram (cenários 1–10).
  A primeira rodada achou a lista de hosts desatualizada depois de aplicar mudanças da nuvem
  (corrigido em aa93f54).
- §3 (conta Google real) pendente: depende do client id do dono do projeto.

## Quickstart §3 com conta Google real, 2026-10-30 (Windows 11) — parcial

Projeto `openhost-513300`, cliente "App para computador", escopos `drive.appdata`, `email` e
`openid` (não confidenciais), tela de consentimento em teste. Segredos `GOOGLE_CLIENT_ID` e
`GOOGLE_CLIENT_SECRET` no repositório.

- Conectar e enviar (cenário 1): ✅ depois de duas correções achadas só com o Google real:
  - o Google responde à criação de arquivo só com id, nome e tipo; sem `size` o envio virava
    `CLOUD_CORRUPT` (0aa08c8, o Drive falso agora responde igual);
  - `NETWORK` dizia "verificar as atualizações" também na sincronização (6481ed4).
  O primeiro `Connect` falhou com `NETWORK` logo após ativar a Drive API (propagação do Google).
- Achado sem correção ainda: um envio que falha depois de criar o `keyring.json` deixa a chave
  sozinha na nuvem, e o próximo Conectar pede a senha de um cofre que não existe.
- Pendentes: segundo computador (cenários 2, 4, 6, 9), macOS e Linux.

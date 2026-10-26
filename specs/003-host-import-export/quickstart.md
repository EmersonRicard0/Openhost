# Quickstart: validar Importar e exportar hosts

**Feature**: `003-host-import-export`

## Pré-requisitos

- Build de desenvolvimento (`wails dev`) ou `build/bin/shellvault-e2e.exe`.
- Docker com `tests/fixtures/sshd` no ar (`node scripts/sshd.mjs up`) para os cenários de conexão.
- Fixtures em `internal/importer/testdata/` (criadas pelas tarefas).

## Automatizado

```powershell
go test ./internal/importer/... ./internal/exporter/... ./internal/bridge/...
cd frontend; npx vitest run src/features/importexport
npx playwright test tests/e2e/import-export.spec.ts
```

Esperado: todos verdes. O E2E cobre os cenários 1, 2 e 6 abaixo.

## Cenários manuais

1. **`~/.ssh/config` (US1, SC-301)** — com 50 hosts num `config` contendo `Host *`, `Include`
   e um `IdentityFile` do servidor de teste: Configurações → Importar e exportar →
   "Configuração do OpenSSH" → "Usar ~/.ssh/config". Prévia mostra só hosts concretos, com o
   padrão de `Host *` aplicado. Confirmar. Cronometrar: < 1 min, ≤ 4 cliques. Conectar ao
   host de teste: autentica pela chave, sem senha.
2. **Duplicados (SC-305)** — repetir o cenário 1. Todas as linhas aparecem como duplicadas com
   "Pular"; confirmar não cria nada.
3. **Desfazer (FR-310)** — importar, clicar "Desfazer" no resumo: hosts, grupos e chaves
   criados somem; editar um host antes de desfazer → ele permanece e o resumo informa.
4. **PuTTY (US3)** — criar no PuTTY uma sessão SSH com `.ppk` v3 com passphrase, uma Telnet e
   um nome com espaço. Importar: Telnet aparece ignorada, nome decodificado, passphrase pedida
   uma vez; conectar com a chave convertida.
5. **CSV (US4)** — baixar o modelo, preencher 500 linhas no Excel pt-BR (com acentos, uma
   porta `99999`, grupo `Clientes/Norte/OLTs`), salvar como CSV. Importar: acentos corretos,
   linha inválida desmarcada até corrigir, árvore de grupos criada.
6. **Exportar e levar a outro PC (US2, SC-303)** — exportar tudo em `.openhost` com chaves
   (senha mestra + senha do arquivo). Apagar o cofre (ou usar `SHELLVAULT_DATA_DIR` novo),
   criar outro e importar o arquivo: grupos, hosts, opções e chaves iguais; hosts com senha
   pedem a senha. Senha do arquivo errada → "senha incorreta".
7. **MobaXterm e SecureCRT (US5)** — importar arquivos exportados de cada programa com pastas e
   sessões não SSH; conferir grupos e ignorados; nenhuma senha importada.
8. **`~/.ssh/config` e CSV de saída (US6)** — exportar para o `~/.ssh/config` real com
   "Acrescentar": cópia `config.bak-*` criada, trecho entre marcadores; exportar de novo
   substitui só o trecho; `ssh <apelido>` no terminal conecta. CSV abre no Excel e reimporta.
9. **Segredos (SC-304)** — `npm run test:secrets-scan` (em `frontend/`), ampliado para cobrir os
   arquivos exportados sem chaves e o diretório de dados: nenhum segredo encontrado.

Registrar resultados em `specs/003-host-import-export/validation.md`.

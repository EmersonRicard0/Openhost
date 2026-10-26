# Validação — Importar e exportar hosts

Roteiro em [quickstart.md](quickstart.md). Máquina: Windows 11 Pro 26200, build `-tags e2e`,
servidor SSH de teste no Docker (`scripts/sshd.mjs`).

## Automatizado (2026-10-26)

| Comando | Resultado |
|---|---|
| `go test ./internal/importer/... ./internal/exporter/... ./internal/bridge/...` | ok |
| `npx vitest run src/features/importexport` | 6 de 6 |
| `npx playwright test import-export.spec.ts secrets-scan.spec.ts` | 5 de 5 |
| `npx playwright test performance.spec.ts -g importação` | ok |

## SC-302 — desempenho com 1.000 hosts

| Medida | Go (`perf_test.go`) | E2E, até a tela (`performance.spec.ts`) | Meta |
|---|---:|---:|---:|
| Prévia | ~0,2 s | 0,7–0,8 s | ≤ 3 s |
| Gravação | ~0,2 s | 0,3 s | ≤ 5 s |
| Editar a última linha com 1.000 na tela | — | 0,3 s | — |

## Cenários

| # | Cenário | Situação | Como foi validado |
|---|---|---|---|
| 1 | `~/.ssh/config` (US1, SC-301) | ok | E2E: só hosts concretos, `Host *` aplicado, avisos por linha, conexão pela chave sem senha |
| 2 | Duplicados (SC-305) | ok | E2E: reimportar mostra tudo duplicado com "Pular" e "Importar 0 hosts" desabilitado |
| 3 | Desfazer (FR-310) | ok | E2E desfaz a importação; `TestUndoKeepsHostEditedAfterImport` cobre o host editado antes de desfazer |
| 4 | PuTTY (US3) | parcial | Go: `.ppk` v2/v3 (RSA, Ed25519, ECDSA; sem cifra e com AES), MAC adulterado, leitor de registro falso com Telnet ignorado e nome `%20`. Falta a sessão real no PuTTY instalado |
| 5 | CSV (US4) | parcial | E2E: modelo baixado, mapeamento de colunas e importação; Go: `TestLoadCSVExcelPtBR` (Windows-1252, `;`, acentos), porta inválida, grupos com `/`. Falta a planilha de 500 linhas salva pelo Excel |
| 6 | Exportar e levar a outro PC (US2, SC-303) | ok | E2E: `.openhost` com chaves, cofre novo, senha errada → "Senha incorreta.", certa → importa e conecta pela chave |
| 7 | MobaXterm e SecureCRT (US5) | pendente | depende do cartão 51 (T038–T041) |
| 8 | `~/.ssh/config` e CSV de saída (US6) | parcial | Go: acrescentar com `config.bak-*`, trecho entre marcadores substituído na segunda exportação, marcador sem fechamento recusado, ida e volta OpenSSH e CSV. Falta o `~/.ssh/config` real e o `ssh <apelido>`; o teste não grava no config do usuário |
| 9 | Segredos (SC-304) | ok | `secrets-scan.spec.ts`: diretório de dados e arquivos exportados (OpenHost sem chaves, OpenSSH, CSV) sem segredo legível |

## Polimento visual (T049)

Capturas nos temas claro e escuro: cartões de origem, foco por teclado, prévia mista (inválidos,
avisos, duplicados de rótulo, valores longos), filtro "Precisam de atenção" vazio, erro de
arquivo, 1.000 linhas (topo e rolada), resumo e diálogo de exportar. Ajustes feitos:

- contagens com separador de milhar ("Importar 1.000 hosts", "1.000 de 1.000 hosts marcados");
- `IMPORT_UNREADABLE` dizia "Nenhum host foi encontrado nesse arquivo." também para arquivo de
  outro formato; agora "Não encontramos hosts nesse arquivo. Confira se ele é do formato
  escolhido.";
- campos da prévia mostram o valor inteiro ao passar o mouse (colunas estreitas cortam).

## Pendências para fechar a T050

- Cenário 7 depois do cartão 51.
- Cenários 4, 5 e 8 com os programas reais (PuTTY instalado, Excel, `~/.ssh/config` do usuário):
  validação manual do usuário.

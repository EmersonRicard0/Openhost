# Tasks: Importar e exportar hosts

**Input**: Design documents from `specs/003-host-import-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/bridge.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV): cada parser e serviço tem teste escrito
antes do código, falhando primeiro.

**Divisão**: tarefas marcadas **Go** vão para o Codex pela fila `.agente-queue/`; as demais
(interface, E2E, polimento) ficam com o Claude. Commits sem `Co-Authored-By`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário (US1–US6 da spec)

---

## Phase 1: Setup

- [X] T001 Criar o branch `003-host-import-export` a partir do `002-wails-migration` atual e os pacotes vazios `internal/importer/` e `internal/exporter/` com `doc.go` em pt-BR descrevendo o papel de cada um
- [X] T002 [P] Go: promover `golang.org/x/text` a dependência direta em `go.mod` (uso de `encoding/charmap`, BSD-3) e registrar em `docs/licenses.md`
- [X] T003 [P] Criar a pasta de fixtures `internal/importer/testdata/` com `README.md` explicando a origem de cada arquivo (gerado pelo programa, anonimizado) e a regra de nunca conter senha real

---

## Phase 2: Foundational (bloqueia todas as histórias)

- [X] T004 Go: códigos novos em `internal/apperr/apperr.go` com mensagens pt-BR e teste em `apperr_test.go`: `IMPORT_TOO_LARGE` ("arquivo > 10 MB ou > 5.000 hosts"), `IMPORT_UNREADABLE`, `IMPORT_FORMAT_NEWER`, `FILE_PASSWORD_REQUIRED`, `FILE_PASSWORD_WRONG`, `PREVIEW_EXPIRED`, `UNDO_UNAVAILABLE`
- [X] T005 [P] Go: testes de `internal/importer/preview_test.go` (falham primeiro): linha sem endereço → `state: "invalid"` com `MISSING_ADDRESS`; porta fora de "1–65535" → `INVALID_PORT`; porta ausente → 22; rótulo vazio → endereço; rótulo "1–100 caracteres"; IPv6 com colchetes normalizado; duplicado com chave `lower(endereço)|porta|usuário` contra o cofre e entre linhas; `selected` padrão (`ok` → true, `invalid` → false e não pode virar true, `duplicate` → false com `skip`); `LABEL_REPEATED` para rótulo igual com endereço diferente; limite de 5.000 linhas
- [X] T006 Go: `internal/importer/preview.go` — tipos `ImportPreview`, `PreviewRow`, `PreviewKey`, `PreviewGroup`, `IgnoredItem`, `Warning` exatamente como em `data-model.md`; `Build(rows, cofre)`, `UpdateRow`, `SelectAll(groupPath?)`, `SetDuplicateAction` com revalidação; registro de prévia única com expiração de 30 min e `Zero()` que apaga conteúdo de chaves e passphrases
- [X] T007 [P] Go: testes de `internal/importer/keys_test.go`: lê arquivo de chave (limite `MaxKeyBytes`), status `ready`/`needsPassphrase`/`notFound`/`unsupported`/`existing` (mesma impressão digital já no cofre), mesma chave em vários hosts conta uma vez (`usedBy`), passphrase errada → `KEY_BAD_PASSPHRASE`
- [X] T008 Go: `internal/importer/keys.go` — resolução de chaves da prévia reusando `domain.ParsePrivateKey`; `UnlockKey`/`SkipKey`; nome da credencial = nome do arquivo, deduplicado
- [X] T009 [P] Go: testes de `internal/importer/commit_test.go`: `Commit` cria grupos sob `targetGroupId` reaproveitando nomes iguais no mesmo nível; `replace` atualiza só campos da origem preservando credencial de senha, `profileId`, `osIcon` e regras de encaminhamento (FR-307); `keepBoth` cria com sufixo " (importado)"; hosts sem chave ficam `authMethod: "password"` sem credencial; falha injetada no meio do `Mutate` deixa o cofre idêntico (SC-307); `Undo` remove criados, restaura substituídos e mantém os editados depois (`keptEdited`); segundo `Undo` → `UNDO_UNAVAILABLE`
- [X] T010 Go: `internal/importer/commit.go` — `Commit` num único `vault.Store.Mutate` e `ImportBatch` em memória (só o último; descartado ao bloquear)
- [X] T011 Go: `ImportService` em `internal/bridge/import.go` com os métodos de `contracts/bridge.md` (`Sources`, `Preview`, `RemapCsv`, `UpdateRow`, `SelectAll`, `SetDuplicateAction`, `UnlockKey`, `SkipKey`, `Commit`, `Undo`, `Discard`, `SaveCsvTemplate`), registro de origens por `SourceKind`, diálogo nativo por tipo (com `TestService.SetDialogPath` funcionando), descarte da prévia e do lote no bloqueio do cofre; `Bind` em `main.go`; lista de métodos em `internal/bridge/contract_test.go`; teste que serializa todas as respostas e garante ausência de `PRIVATE KEY`, `PuTTY-User-Key-File` e passphrases
- [X] T012 [P] Interface: tipos e API em `frontend/src/shared/model/types.ts` (`SourceKind`, `PreviewView`, `PreviewRow`, `PreviewKey`, `ImportResult`, `ExportRequest`, novos `ErrorCode` com mensagens), `frontend/src/shared/ipc/api.ts` (`imports`, `exports`, `API_SHAPE`) e `frontend/src/bridge/index.ts`
- [X] T013 [P] Interface: store `frontend/src/stores/importExport.ts` (passo atual, prévia, filtro, seleção, erros) com testes em `importExport.test.ts`
- [X] T014 Interface: `frontend/src/features/importexport/ImportExportPage.tsx` + `importexport.module.css` (seção "Importar e exportar" em `features/settings/SettingsPage.tsx` e item "Importar e exportar…" no menu da barra lateral em `features/hosts/HostSidebar.tsx`), cartões de origem com `Sources()`, tokens preto piano e destaque laranja, avisos sem borda
- [X] T015 Interface: `PreviewTable.tsx` — colunas rótulo, endereço, porta, usuário, grupo, chave, origem e avisos; marcar/desmarcar por linha, todas e por grupo; edição inline com `UpdateRow`; linhas `invalid` bloqueadas até corrigir; ação por duplicado e "para todos"; filtro "só avisos/duplicados"; `content-visibility: auto` para 1.000+ linhas; navegação por teclado e rótulos para leitor de tela
- [X] T016 Interface: `ImportWizard.tsx` (origem → prévia → resumo), escolha do grupo de destino, `KeyPassphraseDialog.tsx` (uma vez por chave, "Pular chave"), `ImportSummary.tsx` com contagens de `ImportResult` e "Desfazer"; recarrega hosts e grupos após `Commit`/`Undo`; progresso quando passar de 1 s; testes Vitest de `PreviewTable` e do fluxo

**Checkpoint**: infraestrutura de prévia, gravação, desfazer e tela pronta; cada origem é plugável.

---

## Phase 3: User Story 1 — `~/.ssh/config` (P1) 🎯 MVP

**Goal**: importar hosts e chaves do `~/.ssh/config` com prévia.

**Independent Test**: config de fixture com curingas, `Include` e `IdentityFile`; só hosts concretos criados, chave no cofre, conexão ao `tests/fixtures/sshd` pela chave.

- [X] T017 [P] [US1] Fixtures em `internal/importer/testdata/openssh/`: config simples, `Host *` e `Host *.interno` com padrões, `Host a b c`, `!negação`, `Include config.d/*` (com ciclo), `Match`, `ProxyJump`/`LocalForward`, `IdentityFile` com `~`, `%h`, `%u` e caminho inexistente, `chave=valor` e aspas
- [X] T018 [P] [US1] Go: testes em `internal/importer/openssh_test.go` — casos de R4: "primeiro valor obtido vence", padrões não viram host mas aplicam opções, um host por nome concreto, `Include` até 8 níveis sem repetir, `Match` ignorado com aviso, opções sem equivalente → `OPTION_IGNORED`, token não suportado → `TOKEN_UNSUPPORTED`, `origin` = arquivo:linha
- [X] T019 [US1] Go: `internal/importer/openssh.go` e registro `openssh` em `ImportService` (`useDefault` lê `%USERPROFILE%\.ssh\config`; `defaultFound` em `Sources`)
- [X] T020 [US1] Interface: cartão "Configuração do OpenSSH" com "Usar ~/.ssh/config" e "Escolher arquivo…", ícones de aviso por código na `PreviewTable`
- [X] T021 [US1] E2E `frontend/tests/e2e/import-export.spec.ts`: importar config de fixture (via `SetDialogPath`) com `IdentityFile` de chave de teste gerada por `scripts/gen-test-keys.mjs`, conferir prévia (curinga ignorado, aviso de chave inexistente), confirmar, conectar ao sshd pela chave; reimportar → todos duplicados com "Pular" e nada criado (SC-305); "Desfazer" remove o lote

**Checkpoint**: MVP utilizável.

---

## Phase 4: User Story 2 — `.openhost` e outro PC (P1)

**Goal**: exportar e reimportar hosts, grupos e, opcionalmente, chaves.

**Independent Test**: exportar cofre com grupos aninhados, opções variadas e uma chave; importar num cofre vazio e comparar campo a campo.

- [X] T022 [P] [US2] Go: testes em `internal/exporter/openhost_test.go` e `internal/importer/openhost_test.go` — ida e volta campo a campo (grupos, hosts, `legacyAlgorithms`, `osIcon`, perfil por host, regras de encaminhamento; `detectedOs` não exportado); sem chaves → `encrypted: false` e nenhum segredo no arquivo; com chaves → `encrypted: true`, Argon2id + XChaCha20-Poly1305 com cabeçalho no AD; adulterar `kdf`, `version` ou `payload` → `FILE_PASSWORD_WRONG`; sem senha → `FILE_PASSWORD_REQUIRED`; `version` maior → `IMPORT_FORMAT_NEWER`; hosts com senha chegam sem credencial; ids novos na importação
- [X] T023 [US2] Go: `internal/exporter/openhost.go` (formato R10, reusa `vault.DeriveKEK`/`vault.Seal`, `DefaultKDF`) e `internal/importer/openhost.go` (leitura, `extra` por linha)
- [X] T024 [US2] Go: `ExportService` em `internal/bridge/export.go` (`Count`, `Export` com diálogo de salvar, escopo `all`/`group` com subgrupos/`hosts`, revalidação da senha mestra → `VAULT_BAD_PASSWORD`, força da senha do arquivo → `WEAK_PASSWORD`); `Bind` e contrato
- [X] T025 [US2] Interface: `ExportDialog.tsx` — formato, escopo (tudo, grupo, selecionados; contagem via `Count`), "Incluir chaves privadas" com aviso, senha mestra, senha do arquivo duas vezes com indicador de força; resumo "Salvo em …"; ação "Exportar…" no menu de grupo e da seleção de hosts
- [X] T026 [US2] Interface: origem "Arquivo do OpenHost" com pedido de senha do arquivo quando `FILE_PASSWORD_REQUIRED`/`FILE_PASSWORD_WRONG`
- [X] T027 [US2] E2E em `import-export.spec.ts`: exportar com chaves, criar cofre novo (`launchApp` com `dataDir` novo), importar com senha errada e depois certa, conferir árvore e conexão pela chave; varredura de segredos no `.openhost` sem chaves

---

## Phase 5: User Story 3 — PuTTY / KiTTY (P2)

**Goal**: importar sessões SSH do registro do Windows e chaves `.ppk`.

**Independent Test**: sessões de teste no registro (SSH com e sem `.ppk`, Telnet, "Default Settings") e conferência da prévia.

- [X] T028 [P] [US3] Fixtures `.ppk` em `internal/importer/testdata/ppk/` geradas pelo PuTTYgen: v2 e v3, `ssh-rsa`, `ssh-ed25519`, `ecdsa-sha2-nistp256`, sem cifra e `aes256-cbc` com passphrase conhecida de teste, mais cópias com MAC adulterado; equivalentes OpenSSH para comparar impressão digital
- [X] T029 [P] [US3] Go: testes em `internal/importer/ppk_test.go` — conversão de cada fixture com impressão digital igual à equivalente OpenSSH; passphrase errada e MAC adulterado → `KEY_BAD_PASSPHRASE`; tipo/cifra desconhecidos → `KEY_UNSUPPORTED`; tamanho acima de `MaxKeyBytes` recusado
- [X] T030 [US3] Go: `internal/importer/ppk.go` (R6) e integração com `keys.go` (detecção pelo cabeçalho `PuTTY-User-Key-File-`)
- [X] T031 [P] [US3] Go: testes em `internal/importer/putty_test.go` com leitor de registro falso: `Protocol` `ssh` entra, `telnet`/`serial`/`raw`/`rlogin` ignorados com motivo, "Default Settings" ignorada, `HostName` com `user@host`, `PortNumber` DWORD, nome `%20` decodificado, origem PuTTY vs KiTTY; KiTTY portátil a partir de pasta `Sessions` com linhas `Chave\valor\`
- [X] T032 [US3] Go: `internal/importer/putty.go`, `putty_windows.go` (`golang.org/x/sys/windows/registry`, `HKCU\Software\SimonTatham\PuTTY\Sessions` e `HKCU\Software\9bis.com\KiTTY\Sessions`) e `putty_other.go` (indisponível); registro das origens `putty`, `kitty`, `kittyPortable`
- [X] T033 [US3] Interface: cartão "PuTTY / KiTTY" (só quando `available`), opção "Pasta do KiTTY portátil…", seção "Ignorados" com motivo na prévia

---

## Phase 6: User Story 4 — CSV (P2)

**Goal**: importar planilha CSV com árvore de grupos.

**Independent Test**: modelo preenchido com 500 linhas, inválidas, grupos aninhados, `;` e Windows-1252.

- [X] T034 [P] [US4] Fixtures CSV em `internal/importer/testdata/csv/`: UTF-8 com BOM e `;` (Excel pt-BR), Windows-1252 com acentos, `,` com aspas e quebra de linha, tab, sinônimos (`host`, `ip`, `user`), sem coluna de endereço reconhecível, 500 linhas com porta `99999` e linha sem endereço, `Clientes/Norte/OLTs`
- [X] T035 [P] [US4] Go: testes em `internal/importer/csv_test.go` — detecção de separador e codificação, sinônimos de R7, `needsMapping` com lista de colunas, `RemapCsv`, `/` como separador de grupos, coluna `chave` vira `keyRef`, limites "10 MB e 5.000 linhas" → `IMPORT_TOO_LARGE`, modelo gerado tem `nome;endereco;porta;usuario;grupo;chave` e uma linha de exemplo
- [X] T036 [US4] Go: `internal/importer/csv.go`, origem `csv` e `SaveCsvTemplate`
- [X] T037 [US4] Interface: cartão "Planilha (CSV)" com "Baixar modelo"; tela de mapeamento de colunas quando `needsMapping` (um seletor por campo, `endereco` obrigatório)

---

## Phase 7: User Story 5 — MobaXterm e SecureCRT (P3)

**Goal**: importar sessões SSH com pastas viradas grupos.

**Independent Test**: arquivos gerados por cada programa com pastas e sessões não SSH.

- [ ] T038 [P] [US5] Fixtures em `internal/importer/testdata/mobaxterm/` (`.mxtsessions` e `MobaXterm.ini` gerados pelo MobaXterm, com pastas aninhadas, SSH com chave, RDP, Telnet, seção `[Passwords]` com valor fictício) e `testdata/securecrt/` (XML de "Export Settings" com pastas, SSH2 com `Identity Filename V2`, Telnet, Serial, `Password V2` fictício)
- [ ] T039 [P] [US5] Go: testes em `internal/importer/mobaxterm_test.go` e `securecrt_test.go` — só SSH viram hosts, pastas viram `groupPath`, protocolos ignorados com nome, chave lida quando presente (aviso "chave não lida" quando o campo não bate), `[Passwords]`/`Password V2` nunca lidos (o valor fictício não aparece em nenhuma estrutura), UTF-8 com BOM e Windows-1252
- [ ] T040 [US5] Go: `internal/importer/mobaxterm.go` (R8) e `internal/importer/securecrt.go` (R9); origens `mobaxterm` e `securecrt`
- [ ] T041 [US5] Interface: cartões "MobaXterm" e "SecureCRT" com a dica de onde achar o arquivo; resumo final avisa que senhas precisarão ser digitadas na primeira conexão

---

## Phase 8: User Story 6 — exportar para `~/.ssh/config` e CSV (P3)

**Goal**: exportar para o formato do OpenSSH e CSV reimportáveis.

**Independent Test**: exportar nos dois formatos e reimportar num cofre vazio.

- [X] T042 [P] [US6] Go: testes em `internal/exporter/openssh_test.go` e `csv_test.go` — bloco por host com `HostName`, `Port` só se ≠ 22, `User`, comentário `# OpenHost: <grupo> / <rótulo>`; apelido com caracteres fora de `[A-Za-z0-9._-]` trocados por `-` e deduplicado `-2`, `-3`; modo `append` cria `config.bak-AAAAMMDD-HHMMSS`, escreve entre `# >>> OpenHost` e `# <<< OpenHost`, reexportação troca só o trecho; gravação por temporário + rename; o arquivo gerado é reimportado pelo `openssh.go` com os mesmos dados; CSV UTF-8 com BOM, `;`, reimportável, coluna `chave` vazia
- [X] T043 [US6] Go: `internal/exporter/openssh.go` e `internal/exporter/csv.go`; `Export` com `sshConfigMode` obrigatório quando o destino é o `~/.ssh/config` do usuário (`INVALID_INPUT` sem ele)
- [X] T044 [US6] Interface: formatos "OpenSSH" e "CSV" no `ExportDialog`, escolha "Novo arquivo" / "Acrescentar ao ~/.ssh/config" com explicação da cópia de segurança

---

## Phase 9: Polish & Cross-Cutting

- [X] T045 [P] Ampliar `frontend/tests/e2e/secrets-scan.spec.ts` para varrer o diretório de dados após importação e os arquivos `.openhost` (sem chaves), OpenSSH e CSV exportados (SC-304)
- [X] T046 [P] Go: teste de desempenho em `internal/importer/perf_test.go` — prévia de 1.000 hosts (CSV e OpenSSH) ≤ 3 s e `Commit` ≤ 5 s (SC-302); E2E mede a renderização da `PreviewTable` com 1.000 linhas
- [ ] T047 [P] Go: testes de entradas hostis (arquivo de 11 MB, `Include` em ciclo e com 9 níveis, XML com entidades, linhas gigantes) sem pânico nem estouro de memória
- [X] T048 Atualizar `specs/002-wails-migration/contracts/bridge.md` (lista de serviços ligados inclui `ImportService` e `ExportService`, códigos de erro novos) e o README (seção "Importar e exportar")
- [ ] T049 Polimento visual com capturas via E2E (tema claro e escuro, 1.000 linhas, estados vazios "Nenhum host encontrado", erros) e revisão de acessibilidade por teclado
- [ ] T050 Rodar `specs/003-host-import-export/quickstart.md` e registrar em `specs/003-host-import-export/validation.md`
- [ ] T051 Versão nova em `wails.json` (0.4.0), notas de versão e publicação da release pela tag `v0.4.0` (workflow `release.yml`)

---

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T016)** → histórias.
- Dentro do Foundational: T004 antes de T006/T008/T010/T011; T005→T006, T007→T008, T009→T010; T011 depende de T006, T008, T010; T012→T013→T014→T015→T016 (interface pode começar com dados falsos enquanto o Go avança).
- **US1** (T017–T021) e **US2** (T022–T027) dependem só do Foundational; US2 não depende de US1.
- **US3** (T028–T033), **US4** (T034–T037), **US5** (T038–T041) dependem só do Foundational; **US6** (T042–T044) depende de T024 (`ExportService`) e reusa `openssh.go` (T019) no teste de ida e volta.
- **Polish** depois das histórias desejadas; T051 por último.

## Parallel Execution Examples

- Foundational: T005, T007, T009 (testes Go) em paralelo com T012 e T013 (interface).
- US1: T017 e T018 juntos; T020 em paralelo com T019.
- US3: T028/T029 (PPK) em paralelo com T031 (registro).
- Entre histórias: Codex em US3/US4/US5 (Go) enquanto o Claude faz a interface de US1/US2.

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 → validar o cenário 1 do quickstart e liberar.
2. **Incremento 2**: US2 (backup e migração entre PCs).
3. **Incremento 3**: US3 e US4 (PuTTY e planilhas, maior público de NOC).
4. **Incremento 4**: US5 e US6.
5. Polish e release 0.4.0.

# Tasks: Ícones e detecção de fabricantes de equipamentos de rede

**Input**: Design documents from `specs/005-network-vendors/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/detection.md,
quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). Tabela de assinaturas, normalização e
resolução ganham testes antes do código; o envio zero ao stdin e a abertura sem espera têm
teste de integração.

**Divisão**: tarefas marcadas **Go** vão para o Codex pela fila `.agente-queue/`; as demais
(frontend, ícones, e2e, documentação, validação) ficam com o Claude. Commits sem
`Co-Authored-By`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário (US1–US3 da spec)

---

## Phase 1: Setup

- [X] T001 [P] Amostras de fabricantes em `internal/sshx/testdata/vendors/<id>/*.txt`: pelo menos três por fabricante (huawei, zte, datacom, cisco, juniper, hillstone, fortinet, mikrotik, hpe), cada arquivo com cabeçalho `# fonte: banner|terminal` e o texto típico de boas-vindas/aviso/prompt (documentação pública ou captura do usuário), sem IPs, nomes reais ou senhas; incluir variações com cores ANSI e `\r\n`.
- [X] T002 [P] Amostras de servidores em `internal/sshx/testdata/servers/*.txt`: MOTD de Ubuntu, Debian, RHEL, Alpine, Windows OpenSSH e macOS, mais pelo menos quatro MOTDs que citam fabricantes por nome ("Lab Cisco", "jump para os Huawei", "backup Juniper", "Fortinet VPN") (SC-502).

---

## Phase 2: Foundational (ids e classificação pura)

**Checkpoint**: `go test ./internal/domain ./internal/sshx -run 'Vendor|Normalize|Resolve|IsNetwork'` verde, sem rede.

- [ ] T003 **Go** Teste em `internal/domain/os_test.go`: `ValidOSID` aceita `zte`, `datacom`, `hillstone`; `IsNetworkOS` é verdadeiro exatamente para mikrotik, cisco, huawei, juniper, hpe, fortinet, zte, datacom, hillstone. Depois implementar em `internal/domain/os.go` (constantes `OSZTE`, `OSDatacom`, `OSHillstone`, `validOSIDs`, `IsNetworkOS`).
- [ ] T004 **Go** Teste de normalização em `internal/sshx/vendors_test.go`: remove CSI, OSC (BEL e `ESC \`), `ESC x`, troca `\r` por `\n`, descarta controles, minúsculas, UTF-8 inválido vira espaço (research R3). Depois implementar `normalizeText` em `internal/sshx/vendors.go`.
- [ ] T005 **Go** Testes de tabela em `internal/sshx/vendors_test.go` para `ClassifyBanner(text) string` e `ClassifyTerminal([]byte) string` com as assinaturas de research R2: um caso positivo por assinatura, prompts do FortiGate e do MikroTik ancorados na linha, e casos negativos ("cisco" sozinho no terminal não reconhece). Depois implementar a tabela e as funções em `internal/sshx/vendors.go`.
- [ ] T006 **Go** Estender `ClassifyServerVersion` em `internal/sshx/osdetect.go` com `zte`, `datacom`/`dmos`, `hillstone` e `fortissh`; teste em `internal/sshx/osdetect_test.go` (os casos atuais continuam passando).
- [ ] T007 **Go** Teste e implementação de `ResolveOS(Signals) string` em `internal/sshx/osdetect.go`, seguindo a ordem de `data-model.md` (versão → pré-login → os-release com distribuição → terminal → ""), incluindo: versão `Ubuntu` decide antes de tudo; os-release Linux vence terminal "cisco ios"; terminal decide quando os-release vazio.

---

## Phase 3: User Story 1 - Ver o fabricante de cada equipamento (Priority: P1) 🎯 MVP

**Goal**: o host em "Automático" mostra o fabricante depois de uma conexão, por qualquer das fontes.

**Independent Test**: `go test ./internal/sshx -run 'TestVendorSamples|TestServerSamplesAreNotNetwork'` e conexão manual a um equipamento de cada fabricante (quickstart §1 e §5).

- [ ] T008 [US1] **Go** `TestVendorSamples` e `TestServerSamplesAreNotNetwork` em `internal/sshx/vendors_samples_test.go`: percorrem `testdata/vendors` (taxa por fabricante ≥ 90%, SC-501) e `testdata/servers` (nenhum `IsNetworkOS`, SC-502), montando `Signals` pelos cabeçalhos de cada amostra (`fonte`, `versao`, `os-release`; formato em `testdata/README.md`) e chamando `ResolveOS`.
- [ ] T009 [US1] **Go** `BannerCallback` em `internal/sshx/dial.go` guardando a mensagem pré-login (≤ 8 KiB, truncada) em `Client.preAuthBanner`, exposta por `Client.PreAuthBanner()`; o callback sempre devolve `nil`. Teste de integração em `internal/sshx/ssh_integration_test.go` com servidor de teste que envia banner: o texto chega e a autenticação segue igual.
- [ ] T010 [US1] **Go** Observador da saída em `internal/sshx/terminal.go`: `Terminal.Start` envolve `out` num `vendorSniffer` que copia para memória só os primeiros 8 KiB ou 5 s e depois só repassa; `Terminal.InitialOutput(ctx) []byte` espera a janela fechar (ou a sessão fechar, ou ctx) e devolve a cópia uma vez, descartando-a em seguida. Teste unitário em `internal/sshx/terminal_sniffer_test.go`: repassa todos os bytes sem alteração, corta em 8 KiB, fecha por tempo, escritas depois da janela não alocam.
- [ ] T011 [US1] **Go** Detecção em segundo plano em `internal/bridge/sessions.go`: `dialHost` cria o terminal e devolve; uma goroutine reúne versão, `PreAuthBanner`, `InitialOutput` e, quando permitido (T014), o os-release; chama `ResolveOS` e grava com `recordDetectedOS` só se o resultado não for vazio (FR-510). A goroutine termina quando a sessão fecha. Nenhum texto em log ou erro (FR-508).
- [ ] T012 [US1] **Go** `TestDetectionNeverWritesStdin` em `internal/sshx/ssh_integration_test.go`: servidor de teste conta bytes recebidos no stdin do shell durante a janela de detecção com um equipamento simulado (ex.: mostra `JUNOS 21.4R3` no terminal); esperado zero bytes e `detectedOs = juniper` (SC-504).
- [ ] T013 [P] [US1] Atualizar `specs/002-wails-migration/contracts/bridge.md` (seção de hosts): `OsId` com os três ids novos e a nota de que `hosts:changed` pode chegar depois de a aba ficar conectada.

**Checkpoint**: detecção pelas quatro fontes funcionando e testada; ícones ainda genéricos para os três novos.

---

## Phase 4: User Story 2 - Terminal abre sem espera (Priority: P1)

**Goal**: nenhuma espera de detecção antes do terminal; nenhum canal extra em equipamento já conhecido.

**Independent Test**: quickstart §3 e reconexão manual a um Juniper/Datacom conferindo o log do equipamento.

- [ ] T014 [US2] **Go** Regra FR-513 em `internal/bridge/sessions.go`: o canal de `/etc/os-release` só abre com versão genérica, pré-login sem fabricante e `detectedOs` atual fora de `IsNetworkOS`; ele roda em paralelo com a janela do terminal. Teste em `internal/bridge/sessions_test.go` com host já `juniper`: nenhum `exec` aberto.
- [ ] T015 [US2] **Go** `TestDialDoesNotWaitForDetection` em `internal/bridge/sessions_test.go`: servidor de teste OpenSSH genérico que atrasa o `exec` em 3 s; `dialHost` devolve em < 0,2 s além da autenticação e o evento `hosts:changed` chega depois (SC-503).
- [ ] T016 [US2] **Go** Garantir que a distribuição Linux continua reconhecida (Ubuntu via os-release) com a detecção em segundo plano: ajustar `internal/sshx/ssh_integration_test.go` e o e2e `frontend/tests/e2e/os-icon.spec.ts` para esperar o evento em vez de assumir que o avatar muda antes da aba conectar.

**Checkpoint**: SC-503 verificado; Linux detectado como antes.

---

## Phase 5: User Story 3 - Escolher à mão os novos fabricantes (Priority: P2)

**Goal**: ZTE, Datacom e Hillstone no seletor e no avatar, na cor da marca.

**Independent Test**: `npx vitest run src/ui/osIcons.test.ts` e o e2e do seletor (quickstart §4).

- [X] T017 [P] [US3] Teste em `frontend/src/ui/osIcons.test.ts`: `zte`, `datacom` e `hillstone` têm rótulo, caminho próprio (não o ícone genérico) e cor em ao menos um tema (`osLogoColors`).
- [X] T018 [US3] Ids e rótulos: `OS_IDS` em `frontend/src/shared/model/types.ts` e `LABELS` em `frontend/src/ui/osIcons.tsx` (`ZTE`, `Datacom`, `Hillstone`).
- [X] T019 [US3] Desenhar os três ícones próprios (SVG 24×24, um `path`, silhueta preenchida, sem copiar os logos; research R6) em `frontend/src/ui/osIcons.tsx`, com as cores da marca em `EXTRA_HEX`, conferindo em print que se distinguem dos demais a 16 px nos temas escuro e claro (SC-505).
- [ ] T020 [US3] E2e em `frontend/tests/e2e/os-icon.spec.ts`: escolher ZTE, Datacom e Hillstone no seletor "Ícone", conferir a ordem alfabética e o `data-os` do avatar.
- [X] T021 [P] [US3] Registrar em `docs/licenses.md` os três ícones como desenho próprio do projeto e a origem das cores.

**Checkpoint**: os três fabricantes escolhíveis e visíveis.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T022 Rodar o quickstart §1–§4 e registrar em `specs/005-network-vendors/validation.md`; deixar §5 (equipamentos reais) como pendência do usuário.
- [ ] T023 CI verde nos três sistemas (`.github/workflows/ci.yml` já cobre `go test` e Vitest).
- [ ] T024 Revisão de segurança final: conferir com `grep` que nenhum `log.`/erro/evento em `internal/sshx` e `internal/bridge/sessions.go` recebe o texto do banner ou do terminal (FR-508).

---

## Dependencies & Execution Order

- Setup (T001–T002) → Foundational (T003–T007) → US1 (T008–T013) → US2 (T014–T016).
- US3 (T017–T021) depende só de T003 (ids) e pode correr em paralelo com US1/US2 (frontend × Go).
- Polish depois de tudo.

### Parallel Opportunities

- T001 e T002 juntos; T013, T017 e T021 em paralelo com as tarefas Go.
- Codex: T003–T012, T014–T016 (Go). Claude: T001, T002 (com amostras do usuário), T013, T016 (parte e2e), T017–T024.

## Implementation Strategy

1. MVP: Foundational + US1 (detecção pelas fontes novas) — já entrega os ícones dos fabricantes existentes em equipamentos que hoje não eram reconhecidos.
2. US2 tira a espera de até 3 s.
3. US3 completa ZTE, Datacom e Hillstone no visual.

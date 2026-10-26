# Tasks: OpenHost no Linux e no macOS

**Input**: Design documents from `specs/004-linux-macos/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/platform.md,
contracts/release.md, quickstart.md

**Tests**: obrigatórios (Constituição, Princípio IV). Cada leitor por sistema tem teste com
entrada falsa escrito antes do código, e o CI roda os testes nos três sistemas.

**Divisão**: tarefas marcadas **Go** vão para o Codex pela fila `.agente-queue/`; as demais
(frontend, `main.go`, workflows, pacotes, notas, validação) ficam com o Claude. Commits sem
`Co-Authored-By`.

**Sem Linux nem macOS locais**: o Linux é validado em contêiner Docker (build, pacotes,
instalação e teste de abertura com `xvfb-run`). O macOS é validado só pelo CI
(`macos-14`), e os cenários manuais ficam com o usuário.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: história de usuário (US1–US4 da spec)

---

## Phase 1: Setup

- [X] T001 Emenda da constituição 1.0.1 → 1.1.0 (R13) em `.specify/memory/constitution.md` (arquivo local, fora do repositório público)
- [X] T002 [P] Recursos de build em `build/linux/` e `build/darwin/`. Arquivos:
  - `build/linux/openhost.desktop`, com `Name=OpenHost`, `Exec=openhost`, `Icon=openhost`, `Categories=Network;RemoteAccess;System;TerminalEmulator;` e `StartupWMClass=openhost`;
  - ícones `build/linux/icons/128x128/openhost.png` e `512x512/openhost.png`, gerados de `build/appicon.png`;
  - `build/darwin/Info.plist`, com `CFBundleName` `OpenHost` e `LSMinimumSystemVersion` `12.0`;
  - `build/darwin/LEIA-ME — primeira abertura.txt`, com os três caminhos de `contracts/release.md` (botão direito → Abrir; Privacidade e Segurança → "Abrir Mesmo Assim"; `xattr -dr com.apple.quarantine`).
- [X] T003 [P] Registrar em `docs/licenses.md`: `github.com/creack/pty` (MIT, via `go-pty`), `github.com/godbus/dbus/v5` (BSD-2, passa a direta), `nfpm` (MIT) e `appimagetool` (MIT), estes dois só no CI.

---

## Phase 2: Foundational (compilar e abrir nos três sistemas)

**Checkpoint**: `GOOS=linux go vet ./...` e `GOOS=darwin go vet ./...` passam, e o job de CI de cada sistema fica verde.

- [ ] T004 Go: dividir `internal/localpty/shells.go`, sem mudar o comportamento no Windows:
  - `shells.go`: tipos comuns (`Shell`, `ShellKind` com o novo `KindUnix ShellKind = "unix"`, `LocalShell`, `shellReaders`);
  - `shells_windows.go`: registro, PowerShell, cmd, Git Bash e WSL.
  - A parte de Windows de `shells_test.go` vai para `shells_windows_test.go`. `go test ./internal/localpty` continua verde no Windows.
- [ ] T005 [P] Go: testes em `internal/localpty/shells_unix_test.go` (`//go:build !windows`), com `/etc/shells` e sistema de arquivos falsos via `shellReaders`. Casos:
  - comentários e linhas vazias ignorados;
  - só executáveis existentes entram;
  - `/bin/bash` e `/usr/bin/bash` iguais pelo caminho real viram um item;
  - id = nome base, e na colisão `<nome>-<diretório>` (`bash-usr-local`);
  - padrão = `$SHELL`; sem ele, o shell do usuário em `/etc/passwd`; sem nenhum, `/bin/sh`;
  - ordem: padrão primeiro e depois alfabético;
  - sem `/etc/shells`, cai em `bash`, `zsh`, `fish` e `sh` do `PATH`;
  - id do Windows salvo (`powershell`) resolve para o padrão com aviso;
  - `args` = `["-l"]`.
- [ ] T006 Go: `internal/localpty/shells_unix.go` (`//go:build !windows`) conforme `data-model.md` (Shell local) e R2. Em `pty.go`, no Unix, `cmd.Env` recebe `TERM=xterm-256color`, e o comentário do pacote passa a citar o PTY Unix. Shell padrão por sistema: `localpty.DefaultShellID()` (`powershell` no Windows; no Unix o id do shell de login) passa a ser o padrão de `DefaultShell` em `internal/appwin/preferences.go` e o substituto em `internal/bridge/app.go` (`GetPreferences`), no lugar do `PowerShell` fixo; `ValidShellID` aceita os ids do Unix.
- [ ] T007 [P] Go: testes de aparência com leitor falso, nos três arquivos abaixo. Valores fora do domínio esperado viram o padrão.
  - `internal/appwin/appearance_linux_test.go` (portal):
    - `color-scheme` 1 → escuro, 2 → claro, 0 → claro;
    - `accent-color` (0.2, 0.4, 0.6) → `#336699`; ausente → `nil`;
    - `contrast` 1 → alto contraste;
    - portal ausente → claro sem destaque;
    - `TransparencyEnabled` sempre falso.
  - `internal/appwin/appearance_darwin_test.go` (saída de `defaults`):
    - `Dark` / ausente;
    - `AppleAccentColor` -1..6 → tabela;
    - `reduceTransparency`;
    - `increaseContrast`.
- [ ] T008 Go: `internal/appwin/appearance_linux.go` (portal `org.freedesktop.portal.Settings`, `godbus/dbus/v5`) e `appearance_darwin.go` (`defaults read`, R3); construtor `appwin.SystemAppearanceReader()` em cada `appearance_<os>.go` (o do Windows devolve `RegistryAppearanceReader{}`); `internal/bridge/services.go` passa a usá-lo; `godbus/dbus/v5` direta no `go.mod`
- [ ] T009 [P] Go: diretórios de fontes por sistema (R7):
  - `internal/fonts/dirs_windows.go`: o código atual de `%WINDIR%` e `%LOCALAPPDATA%`;
  - `internal/fonts/dirs_linux.go`: `$XDG_DATA_HOME/fonts`, `~/.local/share/fonts`, `~/.fonts`, `/usr/share/fonts` e `/usr/local/share/fonts`, recursivos;
  - `internal/fonts/dirs_darwin.go`: `/System/Library/Fonts`, `/Library/Fonts` e `~/Library/Fonts`.
  - Teste com diretório temporário e uma fonte de `testdata`.
- [ ] T010 [P] Go: permissões no Unix (R8):
  - `internal/appwin/datadir_unix.go`: `DataDir` corrige para `0700` um diretório existente mais aberto;
  - o cofre (`internal/vault`) e as preferências criam arquivos com `0600`;
  - teste `datadir_unix_test.go` e teste no `vault` (`//go:build !windows`): `shellvault.db`, `-wal`, `-shm` e preferências com modo `0600` mesmo com `umask 000`.
- [ ] T011 Opções de janela por sistema (R4, R6):
  - `main.go` chama `platformOptions(dataDir, services)`, implementada em `main_windows.go` (opções atuais, `Frameless: true`, Mica), `main_darwin.go` e `main_linux.go`.
  - `main_darwin.go`:
    - `Frameless: false` e `mac.Options{TitleBar: mac.TitleBarHiddenInset(), WebviewIsTransparent: true, WindowIsTranslucent: true, About: …}`;
    - `Menu` com `menu.AppMenu()`, `menu.EditMenu()` e "Configurações…" (`keys.CmdOrCtrl(",")`), que emite o evento `app:openSettings`.
  - `main_linux.go`: `Frameless: false`, `linux.Options{ProgramName: "openhost", WindowIsTranslucent: false}`.
  - A tag `webkit2_41` fica documentada no README e no CI.
- [X] T012 [P] Interface: `useUi.platform` em `frontend/src/stores/ui.ts`, lido em `frontend/src/main.tsx` com `Environment()` do runtime do Wails antes do primeiro render. O padrão em testes é `'windows'`. Teste em `ui.test.ts`.
- [ ] T013 Go: `main_smoke.go` (`//go:build smoke`), que liga `Smoke.Ready()` (encerra o app com código 0 depois de responder) e uma `TestService` mínima para criar o cofre e um host com senha (reuso de `testsvc`, se couber). Teste do contrato só com a tag.
- [ ] T014 Teste de abertura (R11, FR-422):
  - `frontend/src/app/smoke.ts` chama `Smoke.Ready()` quando `import.meta.env.VITE_SMOKE`, depois de montar a tela de criar o cofre;
  - `scripts/smoke.mjs`:
    - compila ou recebe o binário `-tags smoke`;
    - roda com `SHELLVAULT_DATA_DIR` temporário e cria cofre e host com senha pela ponte de teste;
    - espera a saída com código 0 em até 60 s;
    - varre o diretório de dados (incluindo o perfil do WebView) atrás de senha mestra, senha do host e passphrase em texto, UTF-16 e base64, reusando a lógica de `frontend/tests/e2e/secrets-scan.spec.ts` extraída para `scripts/lib/secrets-scan.mjs`.
- [ ] T015 CI em matriz em `.github/workflows/ci.yml`:
  - `windows-latest`, `ubuntu-22.04` e `macos-14`, com os passos atuais;
  - no Ubuntu, `apt-get install libgtk-3-dev libwebkit2gtk-4.1-dev xvfb` e `-tags webkit2_41`;
  - job `smoke` por sistema: `wails build -tags smoke` e depois `node scripts/smoke.mjs` (com `xvfb-run` no Linux);
  - o Playwright E2E continua só no Windows;
  - `timeout-minutes: 30`.

---

## Phase 3: User Story 1 — Usar o OpenHost no Linux (P1) 🎯 MVP

**Goal**: o app instala pelo `.deb`, `.rpm` ou AppImage e todas as funções rodam no Linux.

**Independent Test**: no contêiner `ubuntu:22.04` com `xvfb`:
- instalar o `.deb` com `apt install ./openhost_*.deb`;
- rodar `openhost` com o build de abertura;
- conectar ao `sshd` de teste pela integração Go;
- abrir `bash` e `zsh` no PTY.

Fazer o mesmo no `fedora:39` com o `.rpm`.

- [ ] T016 [P] [US1] Go: integração do PTY Unix em `internal/localpty/pty_integration_unix_test.go` (`//go:build !windows`):
  - abre `bash -l`, escreve `echo $TERM` e lê `xterm-256color`;
  - `Resize(100, 30)` e depois `stty size` → `30 100`;
  - Ctrl+C (`\x03`) interrompe um `sleep 100`;
  - `exit 3` → código de saída 3;
  - pula se não houver `bash`.
- [ ] T017 [P] [US1] Go: teste do agente no Unix em `internal/sshx/agent_other_test.go`:
  - agente em memória (`golang.org/x/crypto/ssh/agent`) num socket Unix temporário em `SSH_AUTH_SOCK`, com autenticação contra o `sshd` de teste;
  - `SSH_AUTH_SOCK` vazio → `AGENT_UNAVAILABLE`;
  - socket inexistente → `AGENT_UNAVAILABLE` sem o caminho no `detail`.
- [X] T018 [P] [US1] Interface: `frontend/src/app/TitleBar.tsx` não mostra os botões minimizar, maximizar e fechar quando `platform !== 'windows'`, e no Linux não marca área de arrasto (a moldura é nativa). A opção "Vidro" em `frontend/src/features/settings/SettingsPage.tsx` fica escondida no Linux. Testes Vitest por plataforma.
- [ ] T019 [US1] Pacotes do Linux:
  - `build/linux/nfpm.yaml`, com conteúdo e metadados exatos de `contracts/release.md` e sem scripts de remoção;
  - `build/linux/AppRun`: confere `libwebkit2gtk-4.1.so.0` via `ldconfig -p`; se faltar, mostra a mensagem com `zenity`, `kdialog` ou `stderr` e sai com 1;
  - `scripts/package-linux.sh <versão> <arch>`, que gera `openhost_<v>_<arch>.deb`, `openhost-<v>-1.<arch>.rpm` e `OpenHost-<v>-<arch>.AppImage` a partir de `build/bin/openhost`.
- [ ] T020 [US1] Validar o Linux em Docker (`scripts/linux-docker-check.sh`):
  - build no `ubuntu:22.04` com `-tags webkit2_41`;
  - `.deb` instalado no `ubuntu:22.04` e no `ubuntu:24.04`, e `.rpm` no `fedora:39`, cada um com `xvfb-run node scripts/smoke.mjs` usando o binário instalado;
  - `dpkg -r openhost` não apaga `~/.config/ShellVault`;
  - registrar o resultado em `specs/004-linux-macos/validation.md`.

**Checkpoint**: o Linux funciona e instala. MVP entregável.

---

## Phase 4: User Story 2 — Usar o OpenHost no macOS (P2)

**Goal**: app universal em `.dmg`, com atalhos ⌘, botões nativos e menu do app.

**Independent Test**: no CI `macos-14`:
- `wails build -platform darwin/universal -tags smoke` e depois `node scripts/smoke.mjs`;
- `lipo -archs` mostra `x86_64 arm64`;
- o `.dmg` monta e contém `OpenHost.app`, `Applications` e o `LEIA-ME`.

Os cenários 4–7 do quickstart ficam com o usuário.

- [X] T021 [P] [US2] Interface: testes em `frontend/src/app/shortcuts.test.ts` para a tabela do macOS de `contracts/platform.md`:
  - ⌘T, ⌘W, ⇧⌘], ⇧⌘[, ⇧⌘P, ⌘F, ⌘B, ⌘= / ⌘- / ⌘0;
  - ⌃Tab continua;
  - nenhum combo com ⌃ é capturado, exceto ⌃Tab;
  - exibição `⇧⌘T` sem `+`;
  - overrides gravados `Ctrl+…` continuam literais.
- [X] T022 [US2] Interface: `frontend/src/app/shortcuts.ts` e `useShortcuts.ts` com `DEFAULT_SHORTCUTS` por plataforma e formatação com símbolos `⌃ ⌥ ⇧ ⌘`. `ShortcutsEditor.tsx`, `CommandPalette.tsx`, `TabBar.tsx` e `Sidebar.tsx` usam o formatador. A ação `newPowerShell` só aparece no Windows (`actionsFor(platform)`); o id continua para não invalidar overrides gravados.
- [X] T023 [US2] Interface: em `frontend/src/features/terminal/TerminalView.tsx`, no macOS:
  - ⌘C copia a seleção;
  - ⌘V cola pela confirmação de várias linhas já existente;
  - Ctrl+Shift+C/V não são tratados;
  - toda combinação com Ctrl vai para o xterm.
  - Testes no `TerminalView.test.tsx` ou extraídos para uma função pura.
- [ ] T024 [P] [US2] Interface: no macOS, `TitleBar.tsx` reserva 76 px à esquerda, sem botões próprios e com `--wails-draggable: drag` no cabeçalho (os botões e campos ficam `no-drag`). `App.tsx` escuta o evento `app:openSettings` (menu ⌘,) e abre as configurações. Teste Vitest.
- [ ] T025 [US2] `scripts/package-macos.sh <versão>`:
  - a partir de `build/bin/OpenHost.app` (universal), monta pasta temporária com o `.app`, o link `Applications` e o `LEIA-ME`;
  - `hdiutil create -volname OpenHost -format UDZO` gera `OpenHost-<v>-macos-universal.dmg`;
  - confere com `lipo -archs` e com o tamanho até 40 MB.
- [ ] T026 [US2] Confirmar que ⌘Q e o botão vermelho passam pelo `OnBeforeClose` (confirmação com sessões ativas, FR-414) e que `HideWindowOnClose` está falso. Documentar em `validation.md` como cenário manual do usuário.

**Checkpoint**: o macOS compila universal, abre no CI e tem `.dmg`.

---

## Phase 5: User Story 3 — Levar os hosts de um sistema para outro (P2)

**Goal**: `.openhost` idêntico entre sistemas e importação correta fora do Windows.

**Independent Test**: a fixture gerada no Windows é importada no CI de Linux e macOS, com
contagens e chaves iguais.

- [ ] T027 [P] [US3] Go: fixture `internal/importer/testdata/openhost/windows-com-chaves.openhost`, gerada no Windows pelo app com 3 grupos, 5 hosts, 2 chaves e 1 regra, com a senha em `testdata/openhost/senha.txt`. Teste `TestOpenHostFromWindowsImportsAnywhere`, que roda nos três sistemas do CI e confere grupos, hosts, regras e impressões digitais.
- [ ] T028 [P] [US3] Go: `internal/bridge/import.go`: `kittyPortable` com `Available: true` em todos os sistemas (R12); `putty` e `kitty` continuam só no Windows. Teste em `import_test.go` por `runtime.GOOS`.
- [ ] T029 [P] [US3] Go: `samePath` em `internal/bridge/export.go` usa `os.SameFile` quando os dois caminhos existem; sem arquivo, compara exato no Unix e sem caixa no Windows. Teste: no Linux, `~/.ssh/Config` ≠ `~/.ssh/config`; no Windows, iguais.
- [ ] T030 [US3] Interface: `frontend/src/features/importexport/ImportExportPage.tsx` mostra o cartão "KiTTY" quando `kitty` ou `kittyPortable` está disponível. Sem `kitty`, só "Escolher pasta…" e sem a mensagem de "nenhuma sessão neste computador". O cartão "PuTTY" some quando indisponível. Teste Vitest com fontes simuladas.

**Checkpoint**: a migração entre sistemas é coberta por teste no CI.

---

## Phase 6: User Story 4 — Baixar a versão certa para cada sistema (P3)

**Goal**: release 0.4.0 com os cinco artefatos, hashes e notas.

**Independent Test**: tag `v0.4.0-rc.1` (pré-release) → a página mostra os cinco artefatos
obrigatórios, `SHA256SUMS.txt` e as notas.

- [ ] T031 [US4] `.github/workflows/release.yml`. Jobs:
  - `windows` (atual, renomeando para `OpenHost-<v>-windows-amd64-installer.exe`);
  - `macos` (`macos-14`, universal + `package-macos.sh`);
  - `linux-amd64` (`ubuntu-22.04` + `package-linux.sh`);
  - `linux-arm64` (`ubuntu-24.04-arm`, `continue-on-error: true`);
  - `publish`: baixa os artefatos, gera `SHA256SUMS.txt`, falha se faltar algum dos 5 obrigatórios de `contracts/release.md`, cria a release com `docs/release-notes/<v>.md` e marca como pré-release quando a tag tem `-`.
- [ ] T032 [P] [US4] Notas `docs/release-notes/0.4.0.md` com as seções de `contracts/release.md`: novidades da 003 e da 004, qual arquivo baixar, requisitos, primeira abertura no macOS e instalação no Linux.
- [ ] T033 [P] [US4] README: seção "Instalar", com tabela por sistema, versões mínimas, primeira abertura no macOS e build local no Linux (`libwebkit2gtk-4.1-dev`, `-tags webkit2_41`) e no macOS.
- [ ] T034 [US4] Exigir os três jobs do CI na proteção da `main` (`gh api`, com confirmação do usuário antes), publicar a tag `v0.4.0-rc.1` (com confirmação do usuário) e conferir a página da pré-release.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T035 [P] Atualizar `specs/002-wails-migration/contracts/bridge.md`: `Smoke.Ready` só com a tag `smoke` e a nota de plataformas.
- [ ] T036 [P] Checagem de tamanho no CI de release: falha se algum instalador do Linux ou do macOS passar de 40 MB (SC-406).
- [ ] T037 Rodar `specs/004-linux-macos/quickstart.md` (parte automatizada e Docker) e registrar em `specs/004-linux-macos/validation.md`; cenários manuais de macOS e de Linux com interface ficam marcados para o usuário.
- [ ] T038 Lançamento 0.4.0 junto com a T051 da 003: `wails.json` 0.4.0 e tag `v0.4.0` depois da validação.

---

## Dependencies & Execution Order

- **Setup** (T001–T003): T001 feito; T002 e T003 em paralelo.
- **Foundational** (T004–T015) bloqueia todas as histórias:
  - T004 → T005 → T006;
  - T007 → T008;
  - T009 e T010 independentes;
  - T011 depende de T006 e T008 para compilar no Linux e no macOS;
  - T013 → T014 → T015.
- **US1** (T016–T020) depende do Foundational; T019 → T020.
- **US2** (T021–T026) depende do Foundational: T021 → T022; T023 e T024 independentes de T022; T025 depende de T002.
- **US3** (T027–T030) depende só do T004–T008 (compilar); independente de US1 e US2.
- **US4** (T031–T034) depende de T019 e T025.
- **Polish** por último; T038 junto com a T051 da 003.

### Parallel Opportunities

- Codex (Go): T004–T006, T007–T008, T009, T010, T013, T016, T017, T027–T029 seguem em fila; T009 e T010 podem ir junto de T007.
- Claude: T002, T003, T011, T012, T014, T015, T018, T021–T025, T030–T033 em paralelo ao Codex.

## Implementation Strategy

1. **Fundação** (compilar nos três sistemas + CI em matriz + teste de abertura).
2. **MVP = US1 (Linux)**: validável inteiro em Docker nesta máquina.
3. **US2 (macOS)**: validado pelo CI; cenários com a mão no Mac ficam com o usuário.
4. **US3** (pequena, quase só testes) e **US4** (release), por fim a 0.4.0 com a 003.

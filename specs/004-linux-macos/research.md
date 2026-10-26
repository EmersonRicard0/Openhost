# Research: OpenHost no Linux e no macOS

**Feature**: `004-linux-macos` | **Data**: 2026-10-26

Levantamento do código atual (compilação cruzada `GOOS=linux|darwin go vet` por pacote):

- **Já portável**:
  - `sshx/agent_other.go` (`SSH_AUTH_SOCK`), `apperr/errno_other.go`, `appwin/webview_other.go`
    e `importer/putty_other.go`;
  - `appwin.DataDir` (`os.UserConfigDir` + `0o700`);
  - `go-pty`, que fora do Windows já usa `creack/pty`;
  - SQLite (`modernc.org/sqlite`, Go puro), SSH, SFTP, encaminhamento, cofre, importação e
    exportação.
- **Não compila fora do Windows**: só `internal/localpty/shells.go`, que importa
  `golang.org/x/sys/windows/registry`, e o que depende dele (`appwin`, `bridge`, `main`).
- **Compila, mas só tem comportamento de Windows**:
  - `bridge/services.go` usa `appwin.RegistryAppearanceReader`;
  - `fonts` procura só em `%WINDIR%\Fonts` e `%LOCALAPPDATA%`;
  - `main.go` usa só `windows.Options` (Mica, janela sem moldura);
  - no frontend: `TitleBar` com botões próprios, atalhos fixos em Ctrl, texto "PowerShell" na
    ação `newPowerShell`;
  - CI e release só no `windows-latest`.

## R1 — Navegador embutido e CGO

- **Decisão**: Wails v2.17 nos três sistemas. No Linux, WebKitGTK 4.1 com a tag de build
  `webkit2_41`. No macOS, o WKWebView do sistema. O Windows continua com `CGO_ENABLED=0`;
  Linux e macOS compilam com `CGO_ENABLED=1`, que o Wails exige nessas plataformas.
- **Motivo**: o Wails liga o GTK e o Cocoa via cgo; não existe caminho sem cgo. O 4.1 (libsoup3)
  está nos repositórios oficiais de todas as distribuições mínimas da spec: Ubuntu 22.04+,
  Debian 12+, Fedora 39+ e openSUSE Leap 15.5+. O Ubuntu 24.04 não tem mais o 4.0.
- **Alternativas**: WebKitGTK 4.0 (sai das distribuições novas); Wails v3 (ainda alfa, migração
  grande sem ganho para a 0.4.0).

## R2 — Terminal local no Unix

- **Decisão**: manter `go-pty` (que já delega a `creack/pty`, MIT) e separar só a detecção de
  shells:
  - `shells_windows.go` fica com o código atual;
  - `shells_unix.go` (`//go:build !windows`) lê `/etc/shells`, mantém só executáveis existentes
    e remove duplicatas pelo caminho real (`/bin/bash` e `/usr/bin/bash`);
  - o padrão é `$SHELL`, ou, sem ele, o shell do usuário em `/etc/passwd` via `os/user` mais a
    leitura do arquivo; o último recurso é `/bin/sh`.
  - o shell abre com `-l` (shell de login: carrega PATH e aliases, essencial no macOS quando o
    app é aberto pelo Finder sem o ambiente do terminal), `TERM=xterm-256color` e diretório
    inicial `$HOME`.
- **IDs estáveis**: o nome base (`bash`, `zsh`, `fish`, `sh`, `dash`, `ksh`, `tcsh`, `nu`…). Se
  houver dois com o mesmo nome base em caminhos reais diferentes, o segundo recebe o sufixo do
  diretório (`bash-usr-local`). O `kind` novo `unix` cobre todos; o rótulo é o nome base.
- **Shell padrão salvo que sumiu**: mesma regra do Windows (`resolveShell` volta ao padrão e
  avisa).
- **Alternativas**: chamar `creack/pty` direto (duplica o que o `go-pty` já esconde); listar
  shells por nomes fixos (perde shells instalados pelo usuário via Homebrew).

## R3 — Aparência do sistema

- **Decisão**: um `AppearanceReader` por sistema.
  - **Linux** (`appearance_linux.go`): portal `org.freedesktop.portal.Settings`, namespace
    `org.freedesktop.appearance`:
    - `color-scheme` (1 = escuro, 2 = claro, 0 = sem preferência, que vira claro);
    - `accent-color` (tupla RGB, GNOME 47+ e KDE), quando existir;
    - `contrast` (alto contraste).
    - Usa `godbus/dbus/v5`, que já é dependência indireta via Wails; BSD-2.
    - Sem portal (WM mínimo), devolve tema claro e sem cor de destaque; a interface ainda segue
      `prefers-color-scheme`.
  - **macOS** (`appearance_darwin.go`): `defaults read -g AppleInterfaceStyle` (`Dark` ou
    ausente) e `AppleAccentColor` (índice → cor fixa da paleta do sistema). Roda a cada leitura
    do monitor, que já tem intervalo de 1 s.
    - Alternativa via cgo/NSUserDefaults descartada: mais código nativo para o mesmo dado.
  - **Transparência**: `TransparencyEnabled` é verdadeiro no macOS e falso no Linux (FR-412).
  - **Reduzir movimento**: a interface já usa `prefers-reduced-motion`, que o WebKit dos dois
    sistemas reporta.
- **Alternativas**: depender só das media queries do CSS (perde a cor de destaque do sistema);
  ler `gsettings` (só GNOME).

## R4 — Janela e barra de título

- **Decisão**:
  - **macOS**: `Frameless: false` com `mac.TitleBarHiddenInset()`. Os botões nativos ficam
    sobre o cabeçalho do app, no canto esquerdo. O `TitleBar` deixa ~76 px livres à esquerda,
    esconde os próprios botões de janela e marca o cabeçalho com `--wails-draggable: drag`.
    O vidro usa `WindowIsTranslucent` + `WebviewIsTransparent` com aparência `NSAppearanceNameDarkAqua`
    ou `Aqua` seguindo o tema; o fundo continua com a mesma opacidade de token do Windows.
  - **Linux**: `Frameless: false` (decoração nativa do gerenciador de janelas) e o `TitleBar`
    sem os botões de janela. A decoração nativa resolve sozinha arrastar, maximizar por duplo
    clique, encaixe, Wayland e X11, e gerenciadores em mosaico. O fundo é sólido (`glass`
    desligado e opção escondida). Com isso a janela tem duas faixas (moldura do sistema e
    cabeçalho do app), aceitas em troca de não reimplementar o comportamento do gerenciador de
    janelas.
  - **Windows**: sem mudança.
- **Como o frontend sabe o sistema**: `runtime.Environment()` do Wails (`platform`:
  `windows`, `linux` ou `darwin`), lido uma vez na inicialização e guardado no store de UI. Não
  há método novo na ponte (contrato em `contracts/platform.md`).
- **Alternativas**: janela sem moldura no Linux com botões próprios (o redimensionamento pelas
  bordas e o encaixe no Wayland não funcionam bem no Wails v2); `TitleBarHidden` no macOS (perde
  os botões nativos que a spec exige).

## R5 — Atalhos no macOS

- **Decisão**:
  - **Tabela de padrões por sistema** em `shortcuts.ts`. No macOS, `Meta` (Cmd) substitui o
    `Ctrl+Shift` dos padrões:
    - Cmd+T, Cmd+W, Cmd+Shift+] e Cmd+Shift+[ para próxima e anterior (mais Ctrl+Tab);
    - Cmd+Shift+P para a paleta, Cmd+F para buscar, Cmd+B para a barra lateral;
    - Cmd+= / Cmd+- / Cmd+0 para zoom.
    - Cmd não chega ao terminal, então não precisa do Shift que no Windows protege o readline.
  - **Overrides**: os gravados nas preferências continuam como `Combo` literal (`Meta+...`), sem
    tradução entre sistemas.
  - **Exibição**: no macOS, `⌃ ⌥ ⇧ ⌘` + tecla, sem `+`.
  - **Terminal**: Cmd+C copia a seleção e Cmd+V cola (pela confirmação de várias linhas). O
    tratamento de Ctrl+C e Ctrl+V do Windows não vale no macOS, onde Ctrl+C vai para o programa
    como SIGINT.
  - **Ação `newPowerShell`**: renomeada na interface para "Novo terminal (shell padrão)". O id
    continua para não invalidar os overrides gravados.
- **Alternativas**: um token `Mod` genérico nos overrides (exige migrar as preferências gravadas).

## R6 — Menu da aplicação, fechar e Dock (macOS)

- **Decisão**:
  - **Menu**: `options.App.Menu` só no darwin, com `menu.AppMenu()` (Sobre, Ocultar, Sair com
    Cmd+Q) e `menu.EditMenu()` (copiar, colar e desfazer nos campos de texto: sem ele o
    WKWebView não recebe Cmd+C/V), mais o item "Configurações…" com Cmd+, que emite o mesmo
    evento da paleta.
  - **Cmd+Q e o botão vermelho** passam pelo `OnBeforeClose` já existente (confirmação com
    sessões ativas, FR-414).
  - **Fechar a janela encerra o app**, como no Windows (`HideWindowOnClose: false`). Clicar no
    ícone do Dock depois disso abre o app de novo, o que atende FR-413 sem estado de "janela
    oculta" com sessões vivas em segundo plano.
- **Alternativas**: manter o app vivo no Dock com a janela oculta (mais um estado para sessões
  e bloqueio do cofre, sem pedido do usuário).

## R7 — Fontes monoespaçadas

- **Decisão**: diretórios por sistema em `fonts_<os>.go`, com a mesma leitura sob demanda
  (`sfnt.ParseCollectionReaderAt`):
  - **Linux**: `$XDG_DATA_HOME/fonts`, `~/.local/share/fonts`, `~/.fonts`, `/usr/share/fonts` e
    `/usr/local/share/fonts`, recursivos.
  - **macOS**: `/System/Library/Fonts`, `/Library/Fonts` e `~/Library/Fonts`.
- **Alternativas**: `fc-list` (não existe no macOS e exige o fontconfig instalado).

## R8 — Permissões do diretório de dados

- **Decisão**: `DataDir` já cria com `0o700`. No Unix, ele também corrige com `os.Chmod` um
  diretório que já exista com permissão mais aberta. Os arquivos do cofre (SQLite e `-wal`/`-shm`)
  e as preferências são criados com `0o600` (`umask` não deve abrir).
- **Teste**: novo teste `_unix_test.go`, que roda no CI de Linux e macOS.

## R9 — Distribuição

- **macOS**: `wails build -platform darwin/universal` (arm64 e amd64 num só binário; não pede
  Rosetta). O `.dmg` é gerado com `hdiutil create -format UDZO` a partir de uma pasta com o
  `.app`, um link `Applications` e um `LEIA-ME — primeira abertura.txt`.
  - Sem dependência nova (o `create-dmg` exigiria Node no passo e não traz ganho).
  - Nome: `OpenHost-0.4.0-macos-universal.dmg`.
  - O ícone sai de `build/appicon.png` (o Wails gera o `.icns`).
- **Linux**: binário gerado no `ubuntu-22.04` (glibc mais antiga entre as suportadas).
  - **`.deb` e `.rpm`** via **nfpm** (MIT) a partir de `build/linux/nfpm.yaml`:
    - binário em `/usr/bin/openhost`, `.desktop` em `/usr/share/applications/openhost.desktop`,
      ícones hicolor 128 e 512;
    - dependências: `.deb` → `libgtk-3-0 | libgtk-3-0t64, libwebkit2gtk-4.1-0`; `.rpm` →
      `libwebkit2gtk-4.1.so.0()(64bit)` e `libgtk-3.so.0()(64bit)`, nomes por soname que servem
      a Fedora e openSUSE;
    - sem scripts de remoção que toquem `~/.config/ShellVault`.
  - **AppImage** via **appimagetool** (MIT), com `AppRun` próprio:
    - confere `libwebkit2gtk-4.1.so.0` com `ldconfig -p`;
    - se faltar, mostra a mensagem com o pacote a instalar (via `zenity`/`kdialog` quando houver,
      senão no terminal) e sai com código 1;
    - não embute o WebKitGTK (centenas de MB, quebraria SC-406).
  - Nomes: `openhost_0.4.0_amd64.deb`, `openhost-0.4.0-1.x86_64.rpm`,
    `OpenHost-0.4.0-x86_64.AppImage`.
  - **arm64**: job separado no `ubuntu-24.04-arm` com `continue-on-error`, que publica os três
    formatos `aarch64`/`arm64` quando passar. Não bloqueia a release (FR-417).
- **Windows**: sem mudança; o nome passa a `OpenHost-0.4.0-windows-amd64-installer.exe`.
- **Alternativas**: `wails build -package` no Linux (não gera `.deb`/`.rpm`); goreleaser (mais
  uma ferramenta grande para três formatos que o nfpm já cobre); Flatpak e Snap (fora do pedido).

## R10 — CI e release

- **CI** (`ci.yml`): matriz `windows-latest`, `ubuntu-22.04` e `macos-14`, com os mesmos passos
  de hoje (`go vet`, `go test`, tokens, lint, tipos, Vitest).
  - No Ubuntu, instala `libgtk-3-dev libwebkit2gtk-4.1-dev` e roda os testes do `main` com
    `-tags webkit2_41`.
  - Um job `smoke` por sistema compila o app e roda o teste de abertura (R11).
  - O Playwright E2E segue só no Windows.
  - A proteção da branch `main` passa a exigir os três jobs.
- **Release** (`release.yml`): três jobs em paralelo (Windows, macOS, Linux amd64) mais o
  Linux arm64 opcional. Cada um sobe os artefatos; um job final `publish` cria a release com
  todos e falha se faltar qualquer um dos cinco obrigatórios (FR-421).
  - As notas vêm de `docs/release-notes/0.4.0.md`: o que baixar por sistema, as versões mínimas
    e a primeira abertura no macOS.
- **Tempo**: o macOS universal leva ~8–10 min e os demais ~6 min em paralelo, dentro de
  SC-408 (30 min).

## R11 — Teste de abertura do app (FR-422)

- **Decisão**: tag de build `smoke`. O `main_smoke.go` liga um método `Smoke.Ready()`, que o
  frontend chama (só nesse build, via `import.meta.env`) depois de montar a tela inicial. O Go
  responde e encerra com código 0. Um script `scripts/smoke.mjs` abre o binário com
  `SHELLVAULT_DATA_DIR` temporário e falha se não sair com 0 em até 60 s.
  - No Linux roda sob `xvfb-run`; o runner do macOS tem sessão gráfica.
  - O mesmo script, ao terminar, roda a varredura de segredos do diretório de dados de um fluxo
    mínimo (criar cofre e host com senha pela ponte de teste), o que atende FR-404 e SC-405
    fora do Windows sem Playwright.
- **Alternativas**: Playwright com WebKit (não dirige o WebKitGTK nem o WKWebView embutidos);
  apenas compilar (não detecta binário que compila e não abre).

## R12 — Importação fora do Windows

- **Decisão**: `kittyPortable` fica `Available: true` em todos os sistemas (hoje depende de
  `runtime.GOOS`). Na interface, o cartão "KiTTY" aparece quando `kitty` ou `kittyPortable`
  estiver disponível; sem o registro, mostra só "Escolher pasta…". O cartão "PuTTY" some.
  A origem OpenSSH já usa `os.UserHomeDir()`.
- **Exportar para `~/.ssh/config`**: hoje o `samePath` compara com `strings.EqualFold`, o que
  no Linux trataria `~/.ssh/Config` como o config do usuário. Passa a usar `os.SameFile`
  quando os dois existem (vale para os três sistemas e para o APFS do macOS, que normalmente
  não diferencia maiúsculas); sem o arquivo, compara exato no Unix e sem caixa no Windows.

## R13 — Constituição

- **Decisão**: emenda **MINOR 1.0.1 → 1.1.0** na seção "Restrições de Arquitetura e
  Tecnologia". Troca "Plataforma alvo inicial: Windows 10/11 desktop; o código SHOULD evitar
  dependências que impeçam portar para macOS/Linux depois" por:

  > "Plataformas alvo: Windows 10/11, Linux (distribuições com WebKitGTK 4.1) e macOS 12+.
  > Código específico de sistema MUST ficar isolado por build tags com contraparte para os
  > demais sistemas, e o CI MUST compilar e testar nos três."

  Aplicada via `/speckit-constitution` como primeira tarefa, em commit próprio.
- **Também**: a restrição `CGO_ENABLED=0` era do plano da 002, não da constituição. Fica
  restrita ao Windows (ver Complexity Tracking).

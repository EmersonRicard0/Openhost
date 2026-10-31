# Implementation Plan: OpenHost no Linux e no macOS

**Branch**: `003-host-import-export` (sai junto na 0.4.0) | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-linux-macos/spec.md`

## Summary

Levar o OpenHost ao Linux (WebKitGTK 4.1) e ao macOS (WKWebView) com o mesmo Wails v2, isolando
por build tags o pouco que hoje só existe para Windows:

- detecção de shells locais;
- leitor de aparência do sistema;
- diretórios de fontes;
- opções da janela;
- atalhos e barra de título no frontend.

Agente SSH, erros do sistema, diretório de dados, cofre, SSH, SFTP, encaminhamento e
importação/exportação já compilam e funcionam fora do Windows (levantamento em
[research.md](research.md)). A distribuição ganha:

- `.dmg` universal sem assinatura;
- AppImage, `.deb` e `.rpm` (nfpm + appimagetool);
- CI com matriz de três sistemas;
- teste de abertura do app compilado (`-tags smoke`);
- release única com os cinco artefatos.

A constituição recebe a emenda MINOR 1.1.0 (R13).

## Technical Context

**Language/Version**:
- Go 1.26.x: `CGO_ENABLED=0` no Windows; `CGO_ENABLED=1` no Linux e no macOS, que o Wails
  exige (R1).
- TypeScript 6 `strict`.

**Primary Dependencies**:
- As mesmas da 002/003.
- Passam a ser usadas diretamente, sem dependência nova no `go.mod`:
  - `github.com/creack/pty` (MIT, via `go-pty`);
  - `github.com/godbus/dbus/v5` (BSD-2, hoje indireta via Wails; vira direta para o portal
    XDG).
- Ferramentas de build, só no CI: `nfpm` (MIT), `appimagetool` (MIT), `hdiutil` (do macOS).
- Nenhuma dependência nova no frontend.

**Storage**: cofre SQLite e preferências sem mudança de formato. Diretório de dados por
`os.UserConfigDir()`: `~/.config/ShellVault` no Linux e `~/Library/Application Support/ShellVault`
no macOS. Modos `0700`/`0600`.

**Testing**:
- `go test ./...` nos três sistemas no CI. Testes novos:
  - shells Unix (`/etc/shells` falso);
  - leitores de aparência (respostas falsas do portal e do `defaults`);
  - fontes por sistema;
  - permissões do diretório de dados;
  - integração do PTY Unix com `bash` real.
- Vitest para os atalhos por plataforma e o `TitleBar`.
- Teste de abertura `-tags smoke` em cada sistema, com varredura de segredos.
- Playwright E2E segue só no Windows.

**Target Platform**: Windows 10/11 x64; Linux x86_64 (arm64 opcional) com WebKitGTK 4.1
(Ubuntu 22.04+, Debian 12+, Fedora 39+, openSUSE Leap 15.5+); macOS 12+ universal.

**Project Type**: desktop-app (Wails: backend Go + frontend web embutido)

**Performance Goals**:
- Os mesmos da 002 nos três sistemas.
- CI completo em até 30 min (SC-408).
- Instaladores de no máximo 40 MB e app ocioso em no máximo 250 MB (SC-406).

**Constraints**:
- Mesma interface e textos pt-BR.
- Nenhum segredo fora do cofre em nenhum sistema.
- Sem assinatura Apple nem repositório Linux.
- O formato do cofre não muda.
- A release falha se faltar um artefato obrigatório.

**Scale/Scope**:
- ~8 arquivos Go novos por build tag e ~4 alterados (`main.go`, `services.go`, `export.go`,
  `import.go`).
- ~5 arquivos do frontend (`shortcuts.ts`, `TitleBar.tsx`, `TerminalView.tsx`,
  `SettingsPage.tsx`, `ImportExportPage.tsx`).
- 2 workflows, 1 `nfpm.yaml`, 1 `AppRun`, scripts de pacote e notas da release.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Verificação | Status |
|---|---|---|
| **I. Clean Room** | Nenhum código ou visual de terceiros. Ferramentas e bibliotecas novas no uso: `creack/pty` (MIT), `godbus/dbus` (BSD-2), `nfpm` (MIT) e `appimagetool` (MIT), todas compatíveis. | ✅ |
| **II. Segurança** | Cofre e ponte inalterados. Diretório de dados `0700` e arquivos `0600` no Unix (R8). Agente só pelo `SSH_AUTH_SOCK` do usuário. Varredura de segredos roda no Linux e no macOS (R11). Pacotes sem scripts que toquem dados do usuário. App sem assinatura não muda o modelo de ameaça local; os hashes são publicados em `SHA256SUMS.txt`. Revisão abaixo. | ✅ |
| **III. Local-First** | Nada novo sai da máquina. O portal XDG e o `defaults` são locais. Sem atualização automática. | ✅ |
| **IV. Testes Primeiro** | Testes de shells, aparência, fontes e permissões antes de cada implementação. Integração do PTY contra shell real. CI nos três sistemas. Teste de abertura do binário. | ✅ |
| **V. Simplicidade** | Mesmo Wails v2 e mesma interface. Decoração nativa no Linux em vez de reimplementar o gerenciador de janelas (R4). Sem token `Mod` nem migração de preferências (R5). Sem `create-dmg`, goreleaser, Flatpak nem Snap (R9). | ✅ |
| Arquitetura | A emenda de plataforma alvo é aplicada como primeira tarefa (R13). Código por sistema isolado por build tag com contraparte. | ✅ com emenda |

**Re-check pós-design (Phase 1)**: o data-model não muda o formato persistido, o contrato não
acrescenta métodos à ponte (exceto `Smoke.Ready`, só no build de teste) e o quickstart cobre
segredos e permissões nos dois sistemas novos. Nenhuma violação além da emenda prevista.

### Revisão de segurança (Princípio II)

Superfícies tocadas: processo e janela (novas plataformas), diretório de dados (permissões),
autenticação (agente via socket), distribuição (pacotes sem assinatura).

| Risco | Mitigação |
|---|---|
| Cofre legível por outros usuários no Unix | `DataDir` força `0700`; arquivos `0600`; teste `_unix_test.go` no CI de Linux e macOS |
| `SSH_AUTH_SOCK` apontando para socket de outro usuário | o app só usa a variável herdada da sessão do próprio usuário, como o `ssh` do sistema; falha → `AGENT_UNAVAILABLE` sem detalhes do caminho |
| WebKit guardar preenchimento automático de senhas | WebKitGTK e WKWebView embutidos não têm gerenciador de senhas ativo; os campos de segredo já usam `autocomplete="off"`/`new-password`; a varredura do `smoke.mjs` inclui o perfil do WebView no diretório de dados |
| Shell local herdar segredo do app | o processo filho recebe só `os.Environ()` (sem variáveis do cofre), como no Windows |
| Pacote adulterado (sem assinatura) | `SHA256SUMS.txt` na release; o build só roda no GitHub Actions a partir da tag; as notas orientam a conferir o hash |
| Remoção do pacote apagar o cofre | `nfpm.yaml` sem scripts de remoção; dados ficam em `~/.config` (fora do pacote) |
| `defaults`/portal com saída hostil | só valores numéricos ou enumerados são aceitos; qualquer outra coisa vira o padrão |
| `samePath` confundir caminhos no Linux | `os.SameFile` (R12); teste com `~/.ssh/Config` e `~/.ssh/config` diferentes |

## Project Structure

### Documentation (this feature)

```text
specs/004-linux-macos/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── platform.md
│   └── release.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
main.go                         # options por sistema: windows.Options, mac.Options + Menu, linux.Options
main_smoke.go                   # //go:build smoke — Smoke.Ready() (R11)

internal/
├── localpty/
│   ├── shells.go               # tipos comuns (Shell, ShellKind + KindUnix, LocalShell)
│   ├── shells_windows.go       # código atual (registro, PowerShell, cmd, Git Bash, WSL)
│   ├── shells_unix.go          # //go:build !windows — /etc/shells, $SHELL, -l (R2)
│   └── shells_unix_test.go
├── appwin/
│   ├── appearance_linux.go     # portal XDG (R3)
│   ├── appearance_darwin.go    # defaults (R3)
│   ├── datadir_unix.go         # chmod 0700 (R8)
│   └── *_test.go
├── fonts/
│   ├── dirs_windows.go         # diretórios atuais
│   ├── dirs_linux.go           # R7
│   └── dirs_darwin.go          # R7
├── bridge/
│   ├── services.go             # leitor de aparência por sistema (função systemAppearanceReader())
│   ├── import.go               # kittyPortable disponível em todos (R12)
│   └── export.go               # samePath com os.SameFile (R12)

frontend/src/
├── main.tsx                    # lê runtime.Environment() → useUi.platform
├── stores/ui.ts                # platform
├── app/shortcuts.ts            # padrões por plataforma, exibição ⌘ (R5)
├── app/TitleBar.tsx            # sem botões próprios fora do Windows; reserva à esquerda no macOS (R4)
├── features/terminal/TerminalView.tsx   # Cmd+C/V no macOS
├── features/settings/SettingsPage.tsx   # "Vidro" escondido no Linux
└── features/importexport/ImportExportPage.tsx  # cartão KiTTY só com pasta (R12)

build/
├── darwin/Info.plist           # LSMinimumSystemVersion 12.0
├── darwin/LEIA-ME.txt
├── linux/nfpm.yaml
├── linux/openhost.desktop
└── linux/AppRun

scripts/
├── smoke.mjs                   # abre o binário -tags smoke e varre segredos (R11)
├── package-macos.sh            # .app → .dmg (hdiutil)
└── package-linux.sh            # binário → .deb/.rpm (nfpm) e AppImage (appimagetool)

docs/release-notes/0.4.0.md
.github/workflows/ci.yml        # matriz windows/ubuntu/macos + smoke
.github/workflows/release.yml   # 3 jobs + arm64 opcional + publish
.specify/memory/constitution.md # emenda 1.1.0 (R13)
README.md                       # instalação por sistema, primeira abertura no macOS
```

**Structure Decision**: segue a divisão da 002/003. O código Go por sistema fica em arquivos
`_windows.go`, `_unix.go`, `_linux.go` e `_darwin.go` no próprio pacote, sempre com contraparte;
o frontend decide por `useUi.platform`.

Divisão de trabalho:
- **Codex (pela fila)**: Go (`localpty`, `appwin`, `fonts`, ajustes da `bridge`, `main_smoke.go`).
- **Claude**: frontend, `main.go` (opções de janela e menu), workflows, pacotes, notas da
  release e validação visual.

Sem máquina Linux nem macOS local, a validação dos cenários manuais do quickstart depende do
usuário ou de uma VM. O CI cobre compilação, testes e abertura do app.

## Complexity Tracking

| Violação ou acréscimo | Por que é necessário | Alternativa mais simples rejeitada porque |
|---|---|---|
| `CGO_ENABLED=1` no Linux e no macOS (a 002 fixou `CGO_ENABLED=0`) | o Wails só liga o GTK e o Cocoa por cgo | não existe build Wails sem cgo nesses sistemas; trocar de framework está fora do escopo |
| Emenda da constituição (plataforma alvo) | a seção "Restrições" fala em Windows como alvo inicial | manter o texto deixaria todo plano futuro em violação |
| Build tag `smoke` com método extra na ponte | detectar binário que compila e não abre (FR-422) sem Playwright fora do Windows | compilar só não detecta falha de carga do WebKit; Playwright não dirige WebView embutido no Linux/macOS |
| Duas faixas de título no Linux (moldura nativa + cabeçalho) | arrastar, encaixar, Wayland e gerenciadores em mosaico funcionando sem código próprio | janela sem moldura no Wails v2 Linux tem redimensionamento e encaixe instáveis |

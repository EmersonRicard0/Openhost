# Data Model: OpenHost no Linux e no macOS

Nenhuma mudança no cofre, nas preferências gravadas nem no formato `.openhost` (Assumptions da
spec). As entidades abaixo existem só em memória ou no processo de build.

## Plataforma

| Campo | Tipo | Origem | Regras |
|---|---|---|---|
| `platform` | `'windows' \| 'linux' \| 'darwin'` | `runtime.Environment()` do Wails, lido uma vez no início do frontend | imutável durante a execução |

Derivados no frontend (store de UI):

| Derivado | windows | linux | darwin |
|---|---|---|---|
| botões de janela próprios no `TitleBar` | sim | não (moldura nativa) | não (botões nativos sobrepostos) |
| reserva à esquerda no `TitleBar` | 0 | 0 | 76 px |
| opção "Vidro" nas configurações | sim | escondida | sim |
| tabela de atalhos padrão | `Ctrl+Shift+…` | `Ctrl+Shift+…` | `Meta+…` (R5) |
| símbolos nas dicas | `Ctrl+Shift+T` | `Ctrl+Shift+T` | `⇧⌘T` |
| copiar/colar no terminal | Ctrl+Shift+C/V e Ctrl+C/V com seleção | Ctrl+Shift+C/V | Cmd+C/V |

No Go, a plataforma é `runtime.GOOS` e decide por build tag (nunca por `if` em tempo de
execução, exceto `registerPutty`, que já faz assim).

## Shell local (`localpty.LocalShell`)

Sem campos novos; um `kind` novo.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | string | Windows: como hoje. Unix: nome base do executável (`bash`, `zsh`, `fish`…); colisão de nome base com caminho real diferente → `<nome>-<diretório>` (`bash-usr-local`) |
| `label` | string | Unix: nome base |
| `kind` | `ShellKind` | novo `unix` para todos os shells fora do Windows |
| `path`, `args` | privados | Unix: caminho real e `["-l"]` |

Regras de lista no Unix:

1. Ler `/etc/shells`, ignorando comentários e linhas vazias. Sem arquivo, usar `bash`, `zsh`,
   `fish` e `sh` achados no `PATH`.
2. Manter só arquivos regulares executáveis; deduplicar pelo `filepath.EvalSymlinks`.
3. O padrão é o caminho de `$SHELL`, se estiver na lista ou for executável. Se não, o shell do
   usuário em `/etc/passwd`. Se não, `/bin/sh`.
4. Ordenar: o padrão primeiro, depois alfabético por `label`.
5. Fora do Windows não existem `powershell`, `pwsh`, `cmd`, `gitbash` nem `wsl`. Um id desses
   salvo como padrão vira o padrão do sistema, com aviso (regra já existente).

## Aparência do sistema (`appwin.SystemAppearance`)

Sem campos novos; preenchida por leitor de cada sistema (R3).

| Campo | Linux (portal) | macOS (`defaults`) |
|---|---|---|
| `AppsUseLightTheme` | `color-scheme` ≠ 1 | `AppleInterfaceStyle` ≠ `Dark` |
| `SystemAccent` | `accent-color` (RGB 0–1 → `#rrggbb`) ou `nil` | `AppleAccentColor` → tabela de cores do sistema; ausente → azul padrão do sistema; `-1` (grafite) → `nil` |
| `HighContrast` | `contrast` = 1 | `defaults read com.apple.universalaccess increaseContrast` = 1 |
| `TransparencyEnabled` | sempre `false` | `reduceTransparency` ≠ 1 |

## Artefato de release

| Campo | Valores |
|---|---|
| sistema | `windows`, `macos`, `linux` |
| arquitetura | `amd64`/`x86_64`, `universal`, `arm64`/`aarch64` |
| formato | instalador NSIS, `.dmg`, AppImage, `.deb`, `.rpm` |
| obrigatório | sim, exceto Linux arm64 |
| nome | ver [contracts/release.md](contracts/release.md) |

## Permissões de arquivo (Unix)

| Caminho | Modo |
|---|---|
| diretório de dados (`~/.config/ShellVault`, `~/Library/Application Support/ShellVault`) | `0700`, corrigido se mais aberto |
| `shellvault.db` e seus `-wal`/`-shm`, preferências, perfil do WebView | `0600` (diretórios internos `0700`) |

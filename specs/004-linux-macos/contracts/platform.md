# Contrato: comportamento por plataforma

A ponte (`specs/002-wails-migration/contracts/bridge.md`) **não muda**. Nenhum serviço novo e
nenhum método novo no build normal. O que varia por sistema está aqui.

## Frontend ← Wails

| Fonte | Uso |
|---|---|
| `runtime.Environment()` → `{ platform }` | lido uma vez em `main.tsx` antes do primeiro render; guardado em `useUi.platform` |

## Serviços existentes com resultado por sistema

| Serviço.método | Windows | Linux / macOS |
|---|---|---|
| `AppService.ListLocalShells()` | como hoje | shells de `/etc/shells` presentes, `kind: "unix"`, padrão = shell de login ([data-model](../data-model.md)) |
| `SessionService.OpenLocal(shell)` | como hoje | PTY Unix, shell com `-l`, `TERM=xterm-256color`, diretório `$HOME` |
| `ImportService.Sources()` | `putty`, `kitty`, `kittyPortable` disponíveis | `putty` e `kitty` com `available: false`; `kittyPortable` e as demais `available: true` |
| `AppService.GetAppearance()` e evento de aparência | registro | portal XDG (Linux), `defaults` (macOS) |
| `ProfileService.ListFonts()` | `%WINDIR%\Fonts`, `%LOCALAPPDATA%` | diretórios de R7 |
| autenticação "Agente SSH" | pipe do OpenSSH/Pageant | `SSH_AUTH_SOCK`; ausente ou morto → `AGENT_UNAVAILABLE` |


## Atalhos (frontend)

| Ação | Windows / Linux | macOS |
|---|---|---|
| newTab | Ctrl+Shift+T | ⌘T |
| closeTab | Ctrl+Shift+W | ⌘W |
| nextTab / prevTab | Ctrl+Tab / Ctrl+Shift+Tab | ⇧⌘] / ⇧⌘[ (e ⌃Tab / ⌃⇧Tab) |
| palette | Ctrl+Shift+P | ⇧⌘P |
| search | Ctrl+Shift+F | ⌘F |
| toggleSidebar | Ctrl+Shift+B | ⌘B |
| zoomIn / zoomOut / zoomReset | Ctrl+= / Ctrl+- / Ctrl+0 | ⌘= / ⌘- / ⌘0 |
| openSettings | Ctrl+, | ⌘, |
| sair | Alt+F4 (sistema) | ⌘Q (menu do app, passa pelo `OnBeforeClose`) |
| copiar / colar no terminal | Ctrl+Shift+C / Ctrl+Shift+V | ⌘C / ⌘V |

Regra: no macOS, nenhuma combinação com ⌃ (Ctrl) é capturada pelo app, exceto ⌃Tab. Todas
seguem para o terminal (SC-404).

## Build de teste de abertura (`-tags smoke`)

| Método | Entrada | Saída | Efeito |
|---|---|---|---|
| `Smoke.Ready()` | — | `void` | o processo encerra com código 0 depois de responder |

Só existe com a tag `smoke`. O frontend chama esse método quando `import.meta.env.VITE_SMOKE`
estiver definido, depois do primeiro render da tela de criar o cofre.

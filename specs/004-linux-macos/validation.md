# Validação — 004 Linux e macOS

Registro da execução de `quickstart.md`. Linux validado em Docker (`scripts/linux-docker-check.sh`);
macOS pelo CI (`macos-14`) e por cenários manuais do usuário.

## Fechar a janela no macOS (T026, FR-414)

Conferido no código do Wails 2.17 (`internal/frontend/desktop/darwin`):

- ⌘Q e "Sair" no menu do app chamam `applicationShouldTerminate`, que manda a mensagem `Q` e
  cancela o término;
- o botão vermelho chama `windowShouldClose`, que faz o mesmo quando `HideWindowOnClose` é falso.
  O `main.go` não define `HideWindowOnClose`, então vale o padrão (falso);
- a mensagem `Q` passa pelo `OnBeforeClose` (`services.BeforeClose`), o mesmo caminho do Windows:
  com sessões ativas aparece a confirmação, sem sessões o app fecha.

**Cenário manual (usuário, num Mac):** abrir uma sessão SSH ou um terminal local, apertar ⌘Q e
depois clicar no botão vermelho. Nos dois casos deve aparecer "Fechar o OpenHost?" com a contagem
de sessões. Cancelar mantém tudo aberto; confirmar fecha. Sem sessões, os dois fecham direto.

## Empacotamento do Linux (T019)

Rodado em `ubuntu:22.04` com um binário de mentira (o Go ainda não compila no Linux até o cartão
54): `scripts/package-linux.sh 0.4.0 amd64` gerou `openhost_0.4.0_amd64.deb`,
`openhost-0.4.0-1.x86_64.rpm` e `OpenHost-0.4.0-x86_64.AppImage`. O `.deb` tem os caminhos de
`contracts/release.md` e depende de `libgtk-3-0 | libgtk-3-0t64, libwebkit2gtk-4.1-0`. Sem o
WebKitGTK, o AppImage mostra o que instalar e sai com 1.

## Teste de abertura (T014)

No Windows, com um `Smoke.Ready()` provisório (o definitivo é a T013 do Codex):
`node scripts/smoke.mjs` abriu o app, criou cofre, host com senha e chave com passphrase e saiu
com 0 em 2 s; 152 arquivos no diretório de dados sem nenhum segredo legível.

## Linux em Docker (T020)

`scripts/linux-docker-check.sh 0.4.0`, 2026-10-26:

- Build no `ubuntu:22.04` com `-tags webkit2_41` (release e smoke); `go vet ./...` limpo e
  `go test ./internal/...` verde nos 17 pacotes (PTY com bash, agente por `SSH_AUTH_SOCK`,
  permissões 0600/0700 do cofre).
- Pacotes: `openhost_0.4.0_amd64.deb` (7,6 MB), `openhost-0.4.0-1.x86_64.rpm` (7,8 MB),
  `OpenHost-0.4.0-x86_64.AppImage` (7,9 MB), todos abaixo de 40 MB (SC-406).

| Sistema | Pacote | Abre (smoke) | Segredos legíveis | Desinstalar mantém o cofre |
|---|---|---|---|---|
| Ubuntu 22.04 | `.deb` | ok, 2,6 s | nenhum | ok |
| Ubuntu 24.04 | `.deb` | ok, 2,3 s | nenhum | ok |
| Fedora 39 | `.rpm` | ok, 3,3 s | nenhum | ok |
| Ubuntu 22.04 | AppImage | ok, 2,7 s (sem WebKitGTK: mensagem e saída 1) | nenhum | — |

Em cada um, o binário de release instalado não tem biblioteca faltando (`ldd`) e o `.desktop`,
o ícone e o `copyright` estão nos caminhos de `contracts/release.md`.

## Pendências

- macOS: CI `macos-14` (`quality` e `smoke`) e `.dmg` pelo `release.yml` (T031), na
  pré-release `v0.4.0-rc.1` (T034, com confirmação do usuário).
- Cenários manuais do usuário: fechar com sessões no macOS (acima) e uso do app com interface
  no Linux (terminal local, SSH, SFTP).

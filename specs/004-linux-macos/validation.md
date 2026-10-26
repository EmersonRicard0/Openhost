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

## Pendências

- T020: rodar `scripts/linux-docker-check.sh` depois dos cartões 54–56.
- macOS: CI `macos-14` (`quality` e `smoke`) e `.dmg` pelo `release.yml` (T031).

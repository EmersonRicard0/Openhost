# OpenConnect

OpenConnect é um cliente SSH desktop local-first para Windows. Ele reúne terminal SSH e local,
cofre criptografado, organização de hosts e credenciais, SFTP, encaminhamento de portas e
perfis de terminal em uma aplicação nativa construída com Go, Wails e React.

O nome visível do produto é **OpenConnect**. Identificadores internos e o diretório de dados
continuam usando `ShellVault` para manter compatibilidade com versões anteriores.

## Requisitos

- Windows 11, ou Windows 10 com o fallback visual sólido.
- Go 1.26 ou superior. O módulo declara Go 1.26.0.
- Wails CLI 2.17.0:

  ```powershell
  go install github.com/wailsapp/wails/v2/cmd/wails@v2.17.0
  wails doctor
  ```

- Node.js 24 LTS e npm para compilar e testar o frontend.
- Microsoft Edge WebView2 Runtime, já incluído nas instalações atuais do Windows 11.
- NSIS para gerar o instalador Windows com `wails build -nsis`.
- Docker Desktop para executar os servidores SSH usados nos testes de integração e E2E.
- OpenSSH Client e `ssh-agent` do Windows para validar autenticação por agente.

Instale as dependências do frontend depois de obter o repositório:

```powershell
npm --prefix frontend ci
```

## Desenvolvimento

Na raiz do repositório, inicie o aplicativo com recarga automática do frontend:

```powershell
wails dev
```

O Wails usa `frontend/` como projeto web e executa os scripts definidos no
[`wails.json`](wails.json).

## Build

O build otimizado e o instalador NSIS são gerados em `build/bin/`:

```powershell
wails build -clean -nsis -trimpath -ldflags "-s -w"
```

O executável mantém o nome interno `shellvault.exe`; o produto instalado é apresentado como
OpenConnect.

## Testes

Testes Go:

```powershell
go test ./...
```

Testes unitários do frontend:

```powershell
npm --prefix frontend run test
```

O portão de qualidade completo também executa `go vet`, testes Go, verificação de tokens,
lint, verificação de tipos e testes do frontend:

```powershell
node scripts/check.mjs
```

Para os testes de integração, inicie primeiro as fixtures Docker e depois execute os pacotes
Go com a tag `integration`:

```powershell
node scripts/sshd.mjs up
go test -tags integration ./internal/...
```

Ao terminar, os contêineres podem ser removidos com:

```powershell
node scripts/sshd.mjs down
```

Os testes E2E são executados a partir de `frontend/`. O setup do Playwright gera
automaticamente um build Wails com a tag `e2e`:

```powershell
Set-Location frontend
npx playwright test
```

Quando `build/bin/shellvault-e2e.exe` já tiver sido gerado e não precisar ser recompilado,
use `SHELLVAULT_E2E_SKIP_BUILD=1`:

```powershell
$env:SHELLVAULT_E2E_SKIP_BUILD = "1"
npx playwright test
Remove-Item Env:SHELLVAULT_E2E_SKIP_BUILD
```

## Migração do cofre anterior

A versão Wails reconhece automaticamente o cofre Electron da versão 001 no diretório:

```text
%APPDATA%\ShellVault
```

Quando `vault.svlt` existe e ainda não há `shellvault.db`, a tela de desbloqueio informa que
encontrou um cofre anterior. Ao digitar a senha mestra correta, o aplicativo migra numa única
transação:

- grupos e sua hierarquia;
- hosts e ordem de exibição;
- credenciais de senha e chave;
- chaves de servidores já conhecidas;
- regras de encaminhamento;
- configurações do cofre e preferências da interface.

Depois de gravar e conferir o novo `shellvault.db`, o arquivo original é preservado como
`vault.svlt.migrated`. Se a senha estiver errada ou a migração falhar, o arquivo original não é
alterado e a operação pode ser tentada novamente.

Mais detalhes de validação estão em
[`specs/002-wails-migration/quickstart.md`](specs/002-wails-migration/quickstart.md).

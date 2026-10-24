# Patch local do go-webview2

Cópia de `github.com/wailsapp/go-webview2` **v1.0.22** (MIT, ver `LICENSE`), usada via
`replace` no `go.mod` da raiz.

## Por quê

O loader do WebView2 zera `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` (e com isso as chaves de
registro equivalentes) e o Wails v2.17 não expõe `AdditionalBrowserArgs` nas opções públicas.
O ShellVault precisa passar argumentos ao processo do navegador:

- release: `--disable-breakpad --disable-crash-reporter` (sem crash dumps em disco, FR-030);
- build de testes (tag `e2e`): `--remote-debugging-port` para o Playwright (research R18).

## O que mudou

Só `pkg/edge/chromium.go`: variável de pacote `ExtraBrowserArgs` e `NewChromium()` iniciando
`AdditionalBrowserArgs` com ela. O Wails acrescenta os próprios argumentos depois.

## Ao atualizar o Wails

Se o Wails passar a depender de outra versão do go-webview2, copiar a versão nova para cá e
reaplicar o patch acima (ou remover o `replace`, se o Wails passar a expor os argumentos).

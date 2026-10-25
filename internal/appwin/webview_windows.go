package appwin

import "github.com/wailsapp/go-webview2/pkg/edge"

// ConfigureWebView entrega os argumentos ao WebView2 antes de wails.Run. Usa o patch local do
// go-webview2 (third_party/go-webview2/PATCH.md): o loader ignora a variável de ambiente.
func ConfigureWebView(extra []string) {
	edge.ExtraBrowserArgs = WebViewArgs(extra)
	edge.DisableAutofill = true
}

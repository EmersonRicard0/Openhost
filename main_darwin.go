package main

import "github.com/wailsapp/wails/v2/pkg/menu"

// macOS: moldura do sistema com os botões nativos sobre o cabeçalho (TitleBarHiddenInset,
// specs/004 R4).
const frameless = false

// Menu padrão do app (Sobre, Ocultar, Sair com ⌘Q) e de edição: sem ele o WKWebView não recebe
// ⌘C/⌘V nos campos de texto (R6). ⌘, é atalho do próprio app (openSettings).
func appMenu() *menu.Menu {
	return menu.NewMenuFromItems(menu.AppMenu(), menu.EditMenu(), menu.WindowMenu())
}

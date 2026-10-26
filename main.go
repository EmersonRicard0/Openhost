package main

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"os"
	"sync/atomic"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"shellvault/internal/appwin"
	"shellvault/internal/bridge"
)

//go:embed all:frontend/dist
var assets embed.FS

// Ícone da janela no Linux e da caixa "Sobre" no macOS.
//
//go:embed build/appicon.png
var appIcon []byte

// Preenchidos só pelo build de testes (main_e2e.go, tag e2e).
var (
	extraWebViewArgs []string
	extraBindings    func(*bridge.Services) []any
)

func main() {
	if err := run(); err != nil {
		// Sem arquivo de log (FR-030): o erro vai só para stderr, sem dados do usuário.
		fmt.Fprintln(os.Stderr, "OpenHost não pôde iniciar:", err)
		os.Exit(1)
	}
}

func run() error {
	dataDir, err := appwin.DataDir()
	if err != nil {
		return err
	}
	if err := appwin.ClearWebViewAutofillData(dataDir); err != nil {
		return fmt.Errorf("limpar dados antigos de preenchimento automático: %w", err)
	}
	appwin.ConfigureWebView(extraWebViewArgs)

	services, err := bridge.NewServices(dataDir)
	if err != nil {
		return err
	}
	bind := services.Bound()
	if extraBindings != nil {
		bind = append(bind, extraBindings(services)...)
	}

	// Lido pela goroutine da segunda instância; escrito no OnStartup.
	var appCtx atomic.Pointer[context.Context]
	return wails.Run(&options.App{
		Title:              "OpenHost",
		Width:              1280,
		Height:             800,
		MinWidth:           800,
		MinHeight:          500,
		Frameless:          frameless,
		Menu:               appMenu(),
		BackgroundColour:   &options.RGBA{R: 0, G: 0, B: 0, A: 0},
		AssetServer:        &assetserver.Options{Assets: assets},
		LogLevel:           logger.ERROR,
		LogLevelProduction: logger.ERROR,
		ErrorFormatter:     bridge.FormatError,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: instanceID(dataDir),
			// Segunda execução não abre outra janela: traz a existente para frente (FR-111).
			OnSecondInstanceLaunch: func(options.SecondInstanceData) {
				ctx := appCtx.Load()
				if ctx == nil {
					return
				}
				runtime.WindowUnminimise(*ctx)
				runtime.Show(*ctx)
			},
		},
		OnStartup: func(ctx context.Context) {
			appCtx.Store(&ctx)
			services.Startup(ctx)
		},
		OnBeforeClose: services.BeforeClose,
		OnShutdown:    services.Shutdown,
		Bind:          bind,
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			BackdropType:         windows.Mica,
			Theme:                windows.SystemDefault,
			WebviewUserDataPath:  appwin.WebViewDir(dataDir),
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			About: &mac.AboutInfo{
				Title:   "OpenHost",
				Message: "Cliente SSH local-first com cofre criptografado.",
				Icon:    appIcon,
			},
		},
		Linux: &linux.Options{
			Icon:        appIcon,
			ProgramName: "openhost",
			// Fundo sólido: transparência depende do compositor (FR-412).
			WindowIsTranslucent: false,
			WebviewGpuPolicy:    linux.WebviewGpuPolicyOnDemand,
			Messages: &linux.Messages{
				WebKit2GTKMinRequired: "O OpenHost precisa do WebKitGTK %s ou mais novo (pacote libwebkit2gtk-4.1).",
			},
		},
	})
}

// instanceID: uma instância por diretório de dados. Os testes E2E usam diretórios temporários
// e não esbarram no app aberto pelo usuário.
func instanceID(dataDir string) string {
	sum := sha256.Sum256([]byte(dataDir))
	return "shellvault-" + hex.EncodeToString(sum[:8])
}

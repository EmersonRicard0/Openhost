//go:build smoke

// Package smokesvc é o serviço do teste de abertura (specs/004-linux-macos, R11). Só existe no
// build `-tags smoke`; scripts/check-release.mjs garante que não vai para a release.
package smokesvc

import (
	"context"
	"os"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// exitGrace é quanto o Quit do Wails tem para fechar a janela antes da saída forçada.
const exitGrace = 2 * time.Second

// Smoke é ligado ao Wails em window.go.smokesvc.Smoke.
type Smoke struct {
	quit func()
	once sync.Once
}

// New encerra pelo runtime do Wails e, se a janela não fechar a tempo, com os.Exit(0).
func New(ctx func() context.Context) *Smoke {
	return newSmoke(func() {
		time.AfterFunc(exitGrace, func() { os.Exit(0) })
		runtime.Quit(ctx())
	})
}

func newSmoke(quit func()) *Smoke { return &Smoke{quit: quit} }

// Ready é chamado pelo frontend depois de abrir a tela inicial e criar os dados de teste. O
// encerramento roda depois da resposta, para a promessa do frontend não ficar pendurada.
func (s *Smoke) Ready() {
	s.once.Do(func() { go s.quit() })
}

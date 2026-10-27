//go:build e2e

// Package testsvc existe só no build de testes (tag e2e): controla a janela e expõe contadores
// internos para os testes E2E (research R18). O build de release não contém este código.
package testsvc

import (
	"context"
	"errors"
	"os"
	"runtime"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Sessions é o que o TestService precisa do gerenciador de sessões.
type Sessions interface {
	Count() int
	// SizeOf devolve o último tamanho de PTY enviado ao servidor.
	SizeOf(sessionID string) (cols, rows int, ok bool)
}

type Size struct {
	Cols int `json:"cols"`
	Rows int `json:"rows"`
}

type TestService struct {
	ctx             func() context.Context
	sessions        func() Sessions
	setUpdateSource func(string, string) error
	setInstallKind  func(string) error
}

func New(
	ctx func() context.Context,
	sessions func() Sessions,
	setUpdateSource func(string, string) error,
	setInstallKind func(string) error,
) *TestService {
	return &TestService{ctx: ctx, sessions: sessions, setUpdateSource: setUpdateSource, setInstallKind: setInstallKind}
}

func (t *TestService) SetUpdateSource(url, pubkeyB64 string) error {
	if t.setUpdateSource == nil {
		return errors.New("update controls unavailable")
	}
	return t.setUpdateSource(url, pubkeyB64)
}

func (t *TestService) SetInstallKind(kind string) error {
	if t.setInstallKind == nil {
		return errors.New("update controls unavailable")
	}
	return t.setInstallKind(kind)
}

func (t *TestService) Maximise() { wruntime.WindowMaximise(t.ctx()) }

func (t *TestService) Restore() {
	wruntime.WindowUnmaximise(t.ctx())
	wruntime.WindowUnminimise(t.ctx())
}

func (t *TestService) SetSize(width, height int) {
	wruntime.WindowUnmaximise(t.ctx())
	wruntime.WindowSetSize(t.ctx(), width, height)
}

// SetDialogPath troca o arquivo devolvido pelos diálogos de abrir/salvar
// (SHELLVAULT_TEST_DIALOG_PATH) sem reiniciar o app: importar e exportar no mesmo teste.
func (t *TestService) SetDialogPath(path string) error {
	return os.Setenv("SHELLVAULT_TEST_DIALOG_PATH", path)
}

func (t *TestService) Goroutines() int { return runtime.NumGoroutine() }

func (t *TestService) SessionCount() int {
	if s := t.sessions(); s != nil {
		return s.Count()
	}
	return 0
}

func (t *TestService) ServerSizeOf(sessionID string) *Size {
	s := t.sessions()
	if s == nil {
		return nil
	}
	cols, rows, ok := s.SizeOf(sessionID)
	if !ok {
		return nil
	}
	return &Size{Cols: cols, Rows: rows}
}

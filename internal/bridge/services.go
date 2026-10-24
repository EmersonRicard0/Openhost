// Package bridge expõe ao Wails os serviços de contracts/bridge.md. Só as structs devolvidas
// por Bound são ligadas; métodos exportados delas viram funções chamáveis pela interface.
// Services em si não é ligado: seus métodos são o ciclo de vida chamado pelo main.go.
package bridge

import (
	"context"
	"sync"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/session"
	"shellvault/internal/vault"
)

// allServicesWired passa a true quando os 8 serviços do contrato estiverem ligados (T094).
const allServicesWired = false

// Services agrupa os serviços ligados ao Wails e o estado compartilhado entre eles.
type Services struct {
	dataDir string

	ctxMu sync.RWMutex
	ctx   context.Context

	store    *vault.Store
	autoLock *vault.AutoLock
	sessions *session.Manager

	vaultService      *VaultService
	hostService       *HostService
	credentialService *CredentialService
	sessionService    *SessionService
	appService        *AppService
	closeGuard        *appwin.CloseGuard
}

func NewServices(dataDir string) (*Services, error) {
	return newServices(dataDir, vault.DefaultKDF)
}

func newServices(dataDir string, kdf func([]byte) vault.KDFParams) (*Services, error) {
	store, err := vault.Open(dataDir, kdf)
	if err != nil {
		return nil, err
	}
	s := &Services{dataDir: dataDir, store: store}
	s.autoLock = vault.NewAutoLock(store)
	s.sessions = session.NewManager(s.emit)
	s.vaultService = newVaultService(store, s.autoLock)
	s.hostService = newHostService(store)
	s.credentialService = newCredentialService(store, s.Context)
	s.sessionService = newSessionService(store, s.sessions)
	preferences := appwin.NewPreferenceStore(store)
	s.closeGuard = appwin.NewCloseGuard(
		func() appwin.ActiveSummary {
			return appwin.ActiveSummary{Sessions: s.sessions.ActiveCount()}
		},
		func(summary appwin.ActiveSummary) { s.emit("app:close-requested", summary) },
		func() {
			if ctx := s.Context(); ctx != nil {
				wruntime.Quit(ctx)
			}
		},
	)
	s.appService = newAppService(preferences, s.closeGuard, s.Context, s.emit)
	store.OnStatus(func(status vault.Status) { s.emit("vault:state", status) })
	return s, nil
}

// Bound devolve as structs que o main.go passa para options.App.Bind.
func (s *Services) Bound() []any {
	return []any{s.vaultService, s.hostService, s.credentialService, s.sessionService, s.appService}
}

// Context é o contexto do Wails, disponível depois de Startup.
func (s *Services) Context() context.Context {
	s.ctxMu.RLock()
	defer s.ctxMu.RUnlock()
	return s.ctx
}

func (s *Services) emit(name string, payload any) {
	if ctx := s.Context(); ctx != nil {
		wruntime.EventsEmit(ctx, name, payload)
	}
}

func (s *Services) Startup(ctx context.Context) {
	s.ctxMu.Lock()
	s.ctx = ctx
	s.ctxMu.Unlock()
}

// BeforeClose devolve true para impedir o fechamento (confirmação de FR-028, T038).
func (s *Services) BeforeClose(ctx context.Context) bool {
	return s.closeGuard.Intercept()
}

func (s *Services) Shutdown(ctx context.Context) {
	s.sessions.CloseAll()
	_ = s.store.Close()
}

// SessionStats é o que os testes E2E leem do gerenciador de sessões.
type SessionStats interface {
	Count() int
	SizeOf(sessionID string) (cols, rows int, ok bool)
}

// TestSessions só é usado pelo build de testes (main_e2e.go).
func (s *Services) TestSessions() SessionStats {
	return s.sessions
}

func clean(err error) error {
	return apperr.Sanitize(err)
}

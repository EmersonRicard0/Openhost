// Package bridge expõe ao Wails os serviços de contracts/bridge.md. Só as structs devolvidas
// por Bound são ligadas; métodos exportados delas viram funções chamáveis pela interface.
// Services em si não é ligado: seus métodos são o ciclo de vida chamado pelo main.go.
package bridge

import "context"

// allServicesWired passa a true quando os 8 serviços do contrato estiverem ligados (T094).
const allServicesWired = false

// Services agrupa os serviços ligados ao Wails e o estado compartilhado entre eles.
type Services struct {
	dataDir string
	ctx     context.Context
}

func NewServices(dataDir string) *Services {
	return &Services{dataDir: dataDir}
}

// Bound devolve as structs que o main.go passa para options.App.Bind.
func (s *Services) Bound() []any {
	return []any{}
}

// Context é o contexto do Wails, disponível depois de Startup.
func (s *Services) Context() context.Context {
	return s.ctx
}

func (s *Services) Startup(ctx context.Context) {
	s.ctx = ctx
}

// BeforeClose devolve true para impedir o fechamento (confirmação de FR-028, T038).
func (s *Services) BeforeClose(ctx context.Context) bool {
	return false
}

func (s *Services) Shutdown(ctx context.Context) {}

// SessionStats é o que os testes E2E leem do gerenciador de sessões.
type SessionStats interface {
	Count() int
	SizeOf(sessionID string) (cols, rows int, ok bool)
}

// TestSessions só é usado pelo build de testes (main_e2e.go).
func (s *Services) TestSessions() SessionStats {
	return nil
}

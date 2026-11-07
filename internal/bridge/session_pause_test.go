package bridge

import (
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/session"
)

func TestSessionPauseResumeValidateOnlyTheSessionID(t *testing.T) {
	service := &SessionService{sessions: session.NewManager(func(string, any) {})}

	if err := service.Pause("não-é-id"); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("Pause com id inválido = %v", err)
	}
	if err := service.Resume("não-é-id"); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("Resume com id inválido = %v", err)
	}
	missing := domain.NewID()
	if err := service.Pause(missing); err != nil {
		t.Fatalf("Pause de sessão inexistente = %v", err)
	}
	if err := service.Resume(missing); err != nil {
		t.Fatalf("Resume de sessão inexistente = %v", err)
	}
}

package bridge

import (
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
)

func TestForwardServiceCRUDAndLockedBoundary(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	host, err := services.hostService.Create(domain.HostInput{Label: "Host", Address: "localhost", Port: 22,
		Username: "user", AuthMethod: model.AuthAsk})
	if err != nil {
		t.Fatal(err)
	}
	input := domain.ForwardRuleInput{HostID: host.ID, BindAddress: "127.0.0.1", BindPort: 15432,
		DestHost: "localhost", DestPort: 5432}
	rule, err := services.forwardService.Create(input)
	if err != nil {
		t.Fatal(err)
	}
	listed, err := services.forwardService.List(host.ID)
	if err != nil || len(listed) != 1 || listed[0].Status.Status != "inactive" {
		t.Fatalf("lista: %+v %v", listed, err)
	}
	input.DestPort = 5433
	updated, err := services.forwardService.Update(rule.ID, input)
	if err != nil || updated.DestPort != 5433 {
		t.Fatalf("update: %+v %v", updated, err)
	}
	if err := services.vaultService.Lock(); err != nil {
		t.Fatal(err)
	}
	if _, err := services.forwardService.List(host.ID); apperr.CodeOf(err) != apperr.VaultLocked {
		t.Fatalf("List deveria exigir cofre: %v", err)
	}
	if _, err := services.forwardService.ListActive(); err != nil {
		t.Fatalf("ListActive com cofre bloqueado: %v", err)
	}
	if err := services.forwardService.Deactivate(rule.ID); err != nil {
		t.Fatalf("Deactivate com cofre bloqueado: %v", err)
	}
	if err := services.vaultService.Unlock("senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	if err := services.forwardService.Remove(rule.ID); err != nil {
		t.Fatal(err)
	}
	listed, err = services.forwardService.List(host.ID)
	if err != nil || len(listed) != 0 {
		t.Fatalf("remoção: %+v %v", listed, err)
	}
}

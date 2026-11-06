package bridge

import (
	"encoding/json"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
)

func TestSnippetServiceLifecycleAndEvents(t *testing.T) {
	services := testServices(t)
	service := services.snippetService
	wantBridgeCode(t, func() error {
		_, err := service.List()
		return err
	}(), apperr.VaultLocked)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}

	events := 0
	service.emit = func(name string, payload any) {
		if name != EventSnippetsChanged || payload != nil {
			t.Fatalf("evento = %q, %#v", name, payload)
		}
		events++
	}
	created, err := service.Create(domain.SnippetInput{
		Name: "  Versão  ", Text: "show version", Tags: []string{"huawei"},
	})
	if err != nil || created.Name != "Versão" || created.Text != "show version" {
		t.Fatalf("Create = %+v, %v", created, err)
	}
	listed, err := service.List()
	if err != nil || len(listed) != 1 || listed[0].ID != created.ID {
		t.Fatalf("List = %+v, %v", listed, err)
	}

	var patch domain.SnippetInput
	if err := json.Unmarshal([]byte(`{"execute":true}`), &patch); err != nil {
		t.Fatal(err)
	}
	updated, err := service.Update(created.ID, patch)
	if err != nil || !updated.Execute || updated.Name != created.Name || updated.Text != created.Text {
		t.Fatalf("Update = %+v, %v", updated, err)
	}
	duplicate, err := service.Duplicate(created.ID)
	if err != nil || duplicate.Name != "Versão (2)" {
		t.Fatalf("Duplicate = %+v, %v", duplicate, err)
	}
	if err := service.Remove(created.ID); err != nil {
		t.Fatal(err)
	}
	if events != 4 {
		t.Fatalf("eventos locais = %d", events)
	}

	wantBridgeCode(t, service.Remove("id-inválido"), apperr.InvalidInput)
	wantBridgeCode(t, service.Remove("11111111-2222-4333-8444-555555555555"), apperr.NotFound)
	_, err = service.Create(domain.SnippetInput{Name: "Vaza", Text: "segredo-do-comando\t"})
	wantBridgeCode(t, err, apperr.InvalidInput)
	if strings.Contains(err.Error(), "segredo-do-comando") {
		t.Fatalf("erro vazou o texto: %v", err)
	}
}

func TestSnippetServiceEmitsAfterSynchronizedApply(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	events := 0
	services.snippetService.emit = func(name string, payload any) {
		if name == EventSnippetsChanged && payload == nil {
			events++
		}
	}
	content, err := services.store.Read()
	if err != nil {
		t.Fatal(err)
	}
	content.Snippets = append(content.Snippets, model.Snippet{
		ID: "11111111-2222-4333-8444-555555555555", Name: "Remoto", Text: "show clock",
		Tags: []string{}, CreatedAt: "2026-10-30T12:00:00.000Z", UpdatedAt: "2026-10-30T12:00:00.000Z",
	})
	if err := services.store.Apply(content); err != nil {
		t.Fatal(err)
	}
	if events != 1 {
		t.Fatalf("eventos depois da aplicação remota = %d", events)
	}
}

package importer

import (
	"errors"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

func TestCommitReplaceGroupsAndUndo(t *testing.T) {
	store := testStore(t)
	var existing model.Host
	var password model.Credential
	err := store.Mutate(func(c *model.Content) error {
		password, _ = domain.CreatePassword(c, "Senha", "segredo", domain.Now())
		existing, _ = domain.CreateHost(c, domain.HostInput{Label: "Antigo", Address: "same.local", Port: 22, Username: "u", AuthMethod: model.AuthPassword, CredentialID: &password.ID, OSIcon: "ubuntu"}, domain.Now())
		existing.ProfileID = ptr("profile-id")
		for i := range c.Hosts {
			if c.Hosts[i].ID == existing.ID {
				c.Hosts[i] = existing
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	content, _ := store.Read()
	p, err := Build(SourceCSV, "hosts.csv", []CandidateRow{
		{Label: "Novo", Address: "same.local", Port: 22, Username: "u", GroupPath: []string{"Clientes", "Norte"}},
		{Label: "Outro", Address: "other.local", Port: 22, Username: "ops", GroupPath: []string{"Clientes", "Norte"}},
	}, content)
	if err != nil {
		t.Fatal(err)
	}
	replace, selected := DuplicateReplace, true
	if err := p.UpdateRow(p.View().Rows[0].RowID, RowPatch{DuplicateAction: &replace, Selected: &selected}, content); err != nil {
		t.Fatal(err)
	}
	coordinator := NewCoordinator(store)
	coordinator.SetPreview(p)
	result, err := coordinator.Commit(p.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	if result.Created != 1 || result.Replaced != 1 || result.AskPassword != 1 {
		t.Fatalf("resultado = %+v", result)
	}
	after, _ := store.Read()
	if len(after.Groups) != 2 || len(after.Hosts) != 2 {
		t.Fatalf("conteúdo = %+v", after)
	}
	var replaced model.Host
	for _, h := range after.Hosts {
		if h.ID == existing.ID {
			replaced = h
		}
	}
	if replaced.Label != "Novo" || replaced.CredentialID == nil || *replaced.CredentialID != password.ID || replaced.ProfileID == nil || replaced.OSIcon != "ubuntu" {
		t.Fatalf("substituído perdeu campos = %+v", replaced)
	}
	undo, err := coordinator.Undo(result.BatchID)
	if err != nil || undo.Removed != 1 || undo.Restored != 1 {
		t.Fatalf("undo = %+v, %v", undo, err)
	}
	restored, _ := store.Read()
	if len(restored.Hosts) != 1 || restored.Hosts[0].Label != "Antigo" {
		t.Fatalf("restaurado = %+v", restored.Hosts)
	}
	if _, err := coordinator.Undo(result.BatchID); apperr.CodeOf(err) != apperr.UndoUnavailable {
		t.Fatalf("segundo undo = %v", err)
	}
}

func TestUndoKeepsHostEditedAfterImport(t *testing.T) {
	store := testStore(t)
	content, _ := store.Read()
	p, _ := Build(SourceCSV, "hosts.csv", []CandidateRow{{Label: "Novo", Address: "new.local", Port: 22, Username: "u"}}, content)
	coordinator := NewCoordinator(store)
	coordinator.SetPreview(p)
	result, err := coordinator.Commit(p.ID, nil)
	if err != nil {
		t.Fatal(err)
	}
	_ = store.Mutate(func(c *model.Content) error {
		c.Hosts[0].Label = "Editado"
		c.Hosts[0].UpdatedAt = "2099-01-01T00:00:00.000Z"
		return nil
	})
	undo, err := coordinator.Undo(result.BatchID)
	if err != nil || undo.KeptEdited != 1 || undo.Removed != 0 {
		t.Fatalf("undo = %+v, %v", undo, err)
	}
}

func TestCommitFailureIsAtomic(t *testing.T) {
	store := testStore(t)
	before, _ := store.Read()
	p, _ := Build(SourceCSV, "hosts.csv", []CandidateRow{{Label: "A", Address: "a.local", Port: 22, Username: "u"}}, before)
	coordinator := NewCoordinator(store)
	coordinator.SetPreview(p)
	coordinator.commitHook = func(*model.Content) error { return errors.New("falha injetada") }
	if _, err := coordinator.Commit(p.ID, nil); err == nil {
		t.Fatal("Commit deveria falhar")
	}
	after, _ := store.Read()
	if len(after.Hosts) != len(before.Hosts) || len(after.Groups) != len(before.Groups) || len(after.Credentials) != len(before.Credentials) {
		t.Fatalf("cofre mudou: %+v", after)
	}
}

func testStore(t *testing.T) *vault.Store {
	t.Helper()
	store, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	return store
}

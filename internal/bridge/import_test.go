package bridge

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/importer"
)

func TestImportServiceResponsesNeverSerializeSecrets(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	content, err := services.store.Read()
	if err != nil {
		t.Fatal(err)
	}
	preview, err := importer.Build(importer.SourceCSV, "hosts.csv", []importer.CandidateRow{{Label: "Servidor", Address: "host.local", Port: 22, Username: "ops"}}, content)
	if err != nil {
		t.Fatal(err)
	}
	services.importService.coordinator.SetPreview(preview)
	responses := []any{preview.View(), importer.PreviewKey{Ref: "ref", Name: "id_ed25519", Path: "C:/keys/id_ed25519", Status: importer.KeyNeedsPassphrase, UsedBy: 1}, importer.ImportResult{BatchID: "batch"}, importer.UndoResult{}, []ImportSource{}}
	for _, response := range responses {
		raw, err := json.Marshal(response)
		if err != nil {
			t.Fatal(err)
		}
		text := string(raw)
		for _, secret := range []string{"PRIVATE KEY", "PuTTY-User-Key-File", "passphrase-teste"} {
			if strings.Contains(text, secret) {
				t.Fatalf("segredo %q em %s", secret, text)
			}
		}
	}
}

func TestImportServiceLifecycleAndTemplate(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	content, _ := services.store.Read()
	preview, _ := importer.Build(importer.SourceCSV, "hosts.csv", []importer.CandidateRow{{Label: "A", Address: "a.local", Port: 22, Username: "u"}}, content)
	services.importService.coordinator.SetPreview(preview)
	view, err := services.importService.SelectAll(preview.ID, false, nil)
	if err != nil || view.Rows[0].Selected {
		t.Fatalf("SelectAll = %+v, %v", view, err)
	}
	services.store.Lock()
	if _, err := services.importService.SelectAll(preview.ID, true, nil); apperr.CodeOf(err) != apperr.PreviewExpired {
		t.Fatalf("prévia após bloqueio = %v", err)
	}

	path := t.TempDir() + "/modelo.csv"
	services.importService.saveFile = func(_ context.Context) (string, error) { return path, nil }
	if ok, err := services.importService.SaveCsvTemplate(); err != nil || !ok {
		t.Fatalf("modelo = %v, %v", ok, err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(raw), "\ufeffnome;endereco;porta;usuario;grupo;chave") || !strings.Contains(string(raw), "Servidor de exemplo") {
		t.Fatalf("modelo = %q", raw)
	}
}

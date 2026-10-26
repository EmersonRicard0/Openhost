package bridge

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
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

func TestImportServiceOpenSSHSourceAndDefault(t *testing.T) {
	home := t.TempDir()
	sshDir := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDir, 0o700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(sshDir, "config")
	if err := os.WriteFile(config, []byte("Host bridge-host\n  HostName bridge.example.test\n  User ops\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("USERNAME", "local-user")
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	sources, err := services.importService.Sources()
	byKind := make(map[importer.SourceKind]ImportSource, len(sources))
	for _, source := range sources {
		byKind[source.Kind] = source
	}
	if err != nil || !byKind[importer.SourceOpenHost].Available || !byKind[importer.SourceOpenSSH].Available || !byKind[importer.SourceOpenSSH].DefaultFound ||
		!byKind[importer.SourcePuTTY].Available || !byKind[importer.SourceKiTTY].Available || !byKind[importer.SourceKiTTYPortable].Available {
		t.Fatalf("Sources = %+v, %v", sources, err)
	}
	view, err := services.importService.Preview(importer.SourceOpenSSH, PreviewOptions{UseDefault: true})
	if err != nil || view == nil || len(view.Rows) != 1 || view.Rows[0].Address != "bridge.example.test" {
		t.Fatalf("Preview default = %+v, %v", view, err)
	}
	services.importService.Discard(view.ID)

	chosen := filepath.Join(t.TempDir(), "chosen-config")
	if err := os.WriteFile(chosen, []byte("Host chosen\n  HostName chosen.example.test\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	services.importService.pickFile = func(context.Context, importer.SourceKind) (string, error) { return chosen, nil }
	view, err = services.importService.Preview(importer.SourceOpenSSH, PreviewOptions{})
	if err != nil || view == nil || view.Rows[0].Label != "chosen" {
		t.Fatalf("Preview escolhido = %+v, %v", view, err)
	}
}

func TestImportServiceCSVPreviewAndRemap(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "planilha.csv")
	if err := os.WriteFile(path, []byte("servidor;local\nCore;192.0.2.40\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	services.importService.pickFile = func(context.Context, importer.SourceKind) (string, error) { return path, nil }
	view, err := services.importService.Preview(importer.SourceCSV, PreviewOptions{})
	if err != nil || view == nil || view.CSV == nil || !view.CSV.NeedsMapping {
		t.Fatalf("prévia sem endereço = %+v, %v", view, err)
	}
	zero, one := 0, 1
	remapped, err := services.importService.RemapCsv(view.ID, map[string]*int{"nome": &zero, "endereco": &one})
	if err != nil || len(remapped.Rows) != 1 || remapped.Rows[0].Address != "192.0.2.40" {
		t.Fatalf("RemapCsv = %+v, %v", remapped, err)
	}
	result, err := services.importService.Commit(remapped.ID, nil)
	if err != nil || result.Created != 1 {
		t.Fatalf("Commit = %+v, %v", result, err)
	}
	if _, err := services.importService.RemapCsv("inexistente", nil); err == nil {
		t.Fatal("RemapCsv de prévia inexistente deveria falhar")
	}
}

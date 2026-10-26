package importer_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"shellvault/internal/importer"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

// openHostFixtureExpectation é o esperado.json gerado junto com a fixture.
type openHostFixtureExpectation struct {
	Groups       []string `json:"groups"`
	Hosts        []string `json:"hosts"`
	Fingerprints []string `json:"fingerprints"`
	Rules        int      `json:"rules"`
}

// Arquivo exportado no Windows importado em qualquer sistema do CI (specs/004-linux-macos,
// T027, SC-404): mesmos grupos, hosts, regras e impressões digitais das chaves.
func TestOpenHostFromWindowsImportsAnywhere(t *testing.T) {
	dir := filepath.Join("testdata", "openhost")
	raw, err := os.ReadFile(filepath.Join(dir, "senha.txt"))
	if err != nil {
		t.Fatal(err)
	}
	password := strings.TrimSpace(string(raw))
	expectedRaw, err := os.ReadFile(filepath.Join(dir, "esperado.json"))
	if err != nil {
		t.Fatal(err)
	}
	var expected openHostFixtureExpectation
	if err := json.Unmarshal(expectedRaw, &expected); err != nil {
		t.Fatal(err)
	}

	store, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.Create("senha-cofre", "senha-cofre"); err != nil {
		t.Fatal(err)
	}
	content, _ := store.Read()
	preview, err := importer.LoadOpenHost(filepath.Join(dir, "windows-com-chaves.openhost"), &password, content)
	if err != nil {
		t.Fatal(err)
	}
	var previewFingerprints []string
	for _, key := range preview.Keys {
		if key.Status != importer.KeyReady || key.Fingerprint == nil {
			t.Fatalf("chave não ficou pronta: %+v", key)
		}
		previewFingerprints = append(previewFingerprints, *key.Fingerprint)
	}
	assertSameSet(t, "impressões na prévia", previewFingerprints, expected.Fingerprints)

	coordinator := importer.NewCoordinator(store)
	coordinator.SetPreview(preview)
	result, err := coordinator.Commit(preview.ID, nil)
	if err != nil || result.Created != len(expected.Hosts) || result.KeysStored != len(expected.Fingerprints) {
		t.Fatalf("Commit = %+v, %v", result, err)
	}
	imported, _ := store.Read()

	names := map[string]model.Group{}
	for _, g := range imported.Groups {
		names[g.ID] = g
	}
	var groups []string
	for _, g := range imported.Groups {
		path := g.Name
		if g.ParentID != nil {
			path = names[*g.ParentID].Name + "/" + g.Name
		}
		groups = append(groups, path)
	}
	assertSameSet(t, "grupos", groups, expected.Groups)

	var hosts []string
	for _, h := range imported.Hosts {
		hosts = append(hosts, h.Label+"|"+h.Address)
	}
	assertSameSet(t, "hosts", hosts, expected.Hosts)

	var fingerprints []string
	for _, c := range imported.Credentials {
		if c.Kind == model.CredentialKey {
			fingerprints = append(fingerprints, c.Fingerprint)
		}
	}
	assertSameSet(t, "impressões no cofre", fingerprints, expected.Fingerprints)
	if len(imported.ForwardRules) != expected.Rules {
		t.Fatalf("regras = %d, esperado %d", len(imported.ForwardRules), expected.Rules)
	}
}

func assertSameSet(t *testing.T, what string, got, want []string) {
	t.Helper()
	got, want = slices.Clone(got), slices.Clone(want)
	slices.Sort(got)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Fatalf("%s = %v, esperado %v", what, got, want)
	}
}

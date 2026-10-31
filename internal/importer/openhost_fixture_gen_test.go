//go:build genfixture

package importer_test

// Gera testdata/openhost/windows-com-chaves.openhost e esperado.json (specs/004-linux-macos,
// T027). Rodar no Windows: go test -tags genfixture -run TestGenerateOpenHostFixture ./internal/importer/
// Chaves e senha são só de teste.

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shellvault/internal/domain"
	"shellvault/internal/exporter"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

func TestGenerateOpenHostFixture(t *testing.T) {
	dir := filepath.Join("testdata", "openhost")
	password, err := os.ReadFile(filepath.Join(dir, "senha.txt"))
	if err != nil {
		t.Fatal(err)
	}
	content := model.EmptyContent()
	clientes, producao, lab := domain.NewID(), domain.NewID(), domain.NewID()
	content.Groups = []model.Group{
		{ID: clientes, Name: "Clientes", SortOrder: 0},
		{ID: producao, Name: "Produção", ParentID: model.Ptr(clientes), SortOrder: 1},
		{ID: lab, Name: "Laboratório", SortOrder: 2},
	}
	keyA, err := domain.GenerateEd25519(content, "chave-ops", nil, domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	keyB, err := domain.GenerateEd25519(content, "chave-backup", nil, domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	web := domain.NewID()
	content.Hosts = []model.Host{
		{ID: web, Label: "web-01", Address: "web01.example.test", Port: 22, Username: "ops", AuthMethod: model.AuthKey, CredentialID: model.Ptr(keyA.ID), GroupID: model.Ptr(producao), OSIcon: model.OSIconAuto},
		{ID: domain.NewID(), Label: "db-01", Address: "10.0.0.20", Port: 2222, Username: "postgres", AuthMethod: model.AuthKey, CredentialID: model.Ptr(keyA.ID), GroupID: model.Ptr(producao), OSIcon: model.OSIconAuto},
		{ID: domain.NewID(), Label: "backup", Address: "backup.example.test", Port: 22, Username: "backup", AuthMethod: model.AuthKey, CredentialID: model.Ptr(keyB.ID), GroupID: model.Ptr(clientes), OSIcon: model.OSIconAuto},
		{ID: domain.NewID(), Label: "roteador", Address: "192.0.2.1", Port: 22, Username: "admin", AuthMethod: model.AuthAsk, GroupID: model.Ptr(lab), LegacyAlgorithms: true, OSIcon: "mikrotik"},
		{ID: domain.NewID(), Label: "solto", Address: "solto.example.test", Port: 22, Username: "root", AuthMethod: model.AuthAsk, OSIcon: model.OSIconAuto},
	}
	content.ForwardRules = []model.ForwardRule{{ID: domain.NewID(), HostID: web, BindAddress: "127.0.0.1", BindPort: 15432, DestHost: "10.0.0.20", DestPort: 5432}}

	raw, err := exporter.MarshalOpenHost(content, exporter.OpenHostOptions{
		IncludeKeys:  true,
		FilePassword: strings.TrimSpace(string(password)),
		KDF:          vault.TestKDF,
		AppVersion:   "0.4.0",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "windows-com-chaves.openhost"), raw, 0o644); err != nil {
		t.Fatal(err)
	}

	expected := openHostFixtureExpectation{Rules: len(content.ForwardRules)}
	names := map[string]string{}
	for _, g := range content.Groups {
		names[g.ID] = g.Name
	}
	for _, g := range content.Groups {
		path := g.Name
		if g.ParentID != nil {
			path = names[*g.ParentID] + "/" + g.Name
		}
		expected.Groups = append(expected.Groups, path)
	}
	for _, h := range content.Hosts {
		expected.Hosts = append(expected.Hosts, h.Label+"|"+h.Address)
	}
	for _, c := range content.Credentials {
		if c.Kind == model.CredentialKey && c.Fingerprint != "" {
			expected.Fingerprints = append(expected.Fingerprints, c.Fingerprint)
		}
	}
	out, err := json.MarshalIndent(expected, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "esperado.json"), append(out, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}

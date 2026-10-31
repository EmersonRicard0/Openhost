package exporter_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shellvault/internal/exporter"
	"shellvault/internal/importer"
	"shellvault/internal/model"
)

func TestMarshalCSV(t *testing.T) {
	content := exportContent()
	content.Hosts = append(content.Hosts,
		model.Host{ID: "h6", Label: `Nome; com "aspas"`, Address: "q.example", Port: 22, Username: "u"},
		model.Host{ID: "h7", Label: "Quebra\nde linha", Address: "n.example", Port: 22},
	)
	raw := exporter.MarshalCSV(content)

	bom := string([]byte{0xEF, 0xBB, 0xBF})
	if !strings.HasPrefix(string(raw), bom) {
		t.Fatal("CSV sem BOM UTF-8")
	}
	lines := strings.Split(strings.TrimPrefix(string(raw), bom), "\r\n")
	if lines[0] != "nome;endereco;porta;usuario;grupo;chave" {
		t.Fatalf("cabeçalho: %q", lines[0])
	}
	for _, want := range []string{
		"OLT Centro;10.0.0.1;22;admin;Clientes/Norte;",
		"olt-centro;10.0.0.2;2222;root;Clientes/Norte;",
		"Olt Centro;10.0.0.3;22;;;",
		"db.prod;fe80::1;22;ops;;",
		`"Nome; com ""aspas""";q.example;22;u;;`,
	} {
		if !strings.Contains(string(raw), want+"\r\n") {
			t.Errorf("faltou a linha %q em:\n%s", want, raw)
		}
	}
	if !strings.Contains(string(raw), "\"Quebra\nde linha\";n.example;22;;;\r\n") {
		t.Errorf("campo com quebra de linha precisa de aspas:\n%s", raw)
	}
}

func TestMarshalCSVReimportsSameData(t *testing.T) {
	content := exportContent()
	path := filepath.Join(t.TempDir(), "hosts.csv")
	if err := os.WriteFile(path, exporter.MarshalCSV(content), 0o600); err != nil {
		t.Fatal(err)
	}
	preview, err := importer.LoadCSV(path, nil, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	rows := preview.View().Rows
	if len(rows) != len(content.Hosts) {
		t.Fatalf("%d linhas, esperava %d", len(rows), len(content.Hosts))
	}
	for i, host := range content.Hosts {
		row := rows[i]
		if row.Label != host.Label || row.Address != host.Address || row.Port != host.Port || row.Username != host.Username || row.KeyRef != nil {
			t.Errorf("linha %d: %+v, host %+v", i, row, host)
		}
	}
	if strings.Join(rows[0].GroupPath, "/") != "Clientes/Norte" {
		t.Errorf("grupo: %v", rows[0].GroupPath)
	}
}

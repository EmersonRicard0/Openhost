package exporter_test

import (
	"strings"
	"testing"

	"shellvault/internal/exporter"
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

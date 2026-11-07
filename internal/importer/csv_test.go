package importer

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func loadCSVFixture(t *testing.T, name string, mapping map[string]*int) *ImportPreview {
	t.Helper()
	p, err := LoadCSV(filepath.Join("testdata", "csv", name), mapping, model.EmptyContent())
	if err != nil {
		t.Fatalf("LoadCSV(%s): %v", name, err)
	}
	return p
}

func TestLoadCSVExcelPtBR(t *testing.T) {
	p := loadCSVFixture(t, "excel-ptbr.csv", nil)
	rows := p.View().Rows
	if len(rows) != 3 {
		t.Fatalf("%d linhas: %+v", len(rows), rows)
	}
	first := rows[0]
	if first.Label != "OLT Centro" || first.Address != "192.0.2.10" || first.Port != 22 || first.Username != "admin" {
		t.Fatalf("primeira linha: %+v", first)
	}
	if strings.Join(first.GroupPath, "|") != "Clientes|Norte|OLTs" {
		t.Fatalf("grupo: %v", first.GroupPath)
	}
	if rows[1].Label != "Concentrador São José" || rows[1].Port != 2222 || rows[1].Username != "operação" {
		t.Fatalf("acentos e porta: %+v", rows[1])
	}
	if rows[2].Address != "2001:db8::1" || rows[2].Port != 22 || rows[2].KeyRef == nil {
		t.Fatalf("IPv6, porta vazia e chave: %+v", rows[2])
	}
	if !strings.HasSuffix(rows[0].Origin, "excel-ptbr.csv:2") || !strings.HasSuffix(rows[2].Origin, ":4") {
		t.Fatalf("origem por linha: %q, %q", rows[0].Origin, rows[2].Origin)
	}
	csv := p.View().CSV
	if csv == nil || csv.NeedsMapping || len(csv.Columns) != 6 || csv.Columns[1] != "Endereço" {
		t.Fatalf("estado CSV: %+v", csv)
	}
	if got := csv.Mapping["chave"]; got == nil || *got != 5 {
		t.Fatalf("coluna chave: %v", got)
	}
	// A chave relativa é procurada ao lado da planilha e, como não existe, avisa.
	if key := p.View().Keys[0]; key.Status != KeyNotFound || !strings.Contains(filepath.ToSlash(key.Path), "testdata/csv/keys/id_ed25519") {
		t.Fatalf("chave: %+v", key)
	}
}

func TestLoadCSVEncodingsAndSeparators(t *testing.T) {
	cp := loadCSVFixture(t, "win1252.csv", nil).View().Rows
	if len(cp) != 1 || cp[0].Label != "Servidor São Paulo" || cp[0].Username != "joão" || strings.Join(cp[0].GroupPath, "/") != "Matriz/Produção" {
		t.Fatalf("Windows-1252: %+v", cp)
	}

	comma := loadCSVFixture(t, "comma-quoted.csv", nil).View().Rows
	if len(comma) != 3 || comma[0].Label != "Roteador, sala 2" || comma[1].Label != "Duas\nlinhas" || comma[2].Address != "203.0.113.9" {
		t.Fatalf("vírgula com aspas: %+v", comma)
	}
	if !strings.HasSuffix(comma[2].Origin, ":5") {
		t.Fatalf("a linha conta a quebra dentro das aspas: %q", comma[2].Origin)
	}

	tab := loadCSVFixture(t, "tab.csv", nil).View().Rows
	if len(tab) != 1 || tab[0].Label != "Tab um" || tab[0].Address != "192.0.2.20" {
		t.Fatalf("tabulação: %+v", tab)
	}

	syn := loadCSVFixture(t, "synonyms.csv", nil).View().Rows
	if len(syn) != 1 || syn[0].Label != "web-1" || syn[0].Address != "192.0.2.30" || syn[0].Username != "deploy" || strings.Join(syn[0].GroupPath, "/") != "Web" {
		t.Fatalf("sinônimos: %+v", syn)
	}
}

func TestLoadCSVNeedsMappingAndRemap(t *testing.T) {
	p := loadCSVFixture(t, "no-address.csv", nil)
	view := p.View()
	if view.CSV == nil || !view.CSV.NeedsMapping || len(view.Rows) != 0 {
		t.Fatalf("sem endereço reconhecível: %+v", view)
	}
	if strings.Join(view.CSV.Columns, "|") != "servidor|local|acesso" {
		t.Fatalf("colunas: %v", view.CSV.Columns)
	}

	zero, one, two := 0, 1, 2
	remapped, err := RemapCSV(p, map[string]*int{"nome": &zero, "endereco": &one, "usuario": &two}, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	rows := remapped.View().Rows
	if remapped.View().CSV.NeedsMapping || len(rows) != 1 || rows[0].Label != "Core" || rows[0].Address != "192.0.2.40" || rows[0].Username != "netops" {
		t.Fatalf("depois do mapeamento: %+v", remapped.View())
	}

	missing := map[string]*int{"nome": &zero}
	if again, err := RemapCSV(p, missing, model.EmptyContent()); err != nil || !again.View().CSV.NeedsMapping {
		t.Fatalf("mapeamento sem endereço continua pedindo: %v", err)
	}
	bad := 9
	if _, err := RemapCSV(p, map[string]*int{"endereco": &bad}, model.EmptyContent()); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("coluna inexistente = %v", err)
	}
}

func TestLoadCSVInvalidRows(t *testing.T) {
	rows := loadCSVFixture(t, "big-500.csv", nil).View().Rows
	if len(rows) != 500 {
		t.Fatalf("%d linhas", len(rows))
	}
	if rows[99].State != StateInvalid || !hasWarning(rows[99], WarningInvalidPort) {
		t.Fatalf("porta 99999: %+v", rows[99])
	}
	if rows[199].State != StateInvalid || !hasWarning(rows[199], WarningMissingAddress) {
		t.Fatalf("sem endereço: %+v", rows[199])
	}
	if rows[0].State != StateOK || !rows[0].Selected {
		t.Fatalf("linha boa: %+v", rows[0])
	}
}

func TestLoadCSVLimits(t *testing.T) {
	dir := t.TempDir()
	big := filepath.Join(dir, "grande.csv")
	if err := os.WriteFile(big, []byte(strings.Repeat("a", MaxImportBytes+1)), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCSV(big, nil, model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportTooLarge {
		t.Fatalf("11 MB = %v", err)
	}
	many := filepath.Join(dir, "muitas.csv")
	var b strings.Builder
	b.WriteString("nome;endereco\n")
	for i := 0; i <= MaxRows; i++ {
		b.WriteString("h;192.0.2.1\n")
	}
	if err := os.WriteFile(many, []byte(b.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCSV(many, nil, model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportTooLarge {
		t.Fatalf("5.001 linhas = %v", err)
	}
	empty := filepath.Join(dir, "vazio.csv")
	if err := os.WriteFile(empty, []byte("nome;endereco\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadCSV(empty, nil, model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportUnreadable {
		t.Fatalf("só cabeçalho = %v", err)
	}
}

func TestCSVTemplate(t *testing.T) {
	text := strings.TrimPrefix(string(CSVTemplate()), string([]byte{0xEF, 0xBB, 0xBF}))
	lines := strings.Split(strings.TrimRight(text, "\r\n"), "\r\n")
	if len(lines) != 2 || lines[0] != "nome;endereco;porta;usuario;grupo;chave" {
		t.Fatalf("modelo: %q", text)
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "modelo.csv")
	if err := os.WriteFile(path, CSVTemplate(), 0o600); err != nil {
		t.Fatal(err)
	}
	p, err := LoadCSV(path, nil, model.EmptyContent())
	if err != nil || len(p.View().Rows) != 1 || p.View().Rows[0].State != StateOK {
		t.Fatalf("o modelo reimporta sem ajuste: %v", err)
	}
}

func hasWarning(row PreviewRow, code string) bool {
	for _, w := range row.Warnings {
		if w.Code == code {
			return true
		}
	}
	return false
}

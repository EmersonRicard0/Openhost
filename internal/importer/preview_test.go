package importer

import (
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func TestBuildValidatesNormalizesAndFindsDuplicates(t *testing.T) {
	content := model.EmptyContent()
	content.Hosts = append(content.Hosts, model.Host{ID: "host-existing", Address: "EXAMPLE.com", Port: 22, Username: "root"})
	rows := []CandidateRow{
		{Label: "", Address: "[2001:db8::1]", Username: "ops", Origin: "csv:2"},
		{Label: "Sem endereço", Address: "", Port: 22, Username: "ops", Origin: "csv:3"},
		{Label: "Porta", Address: "router.local", Port: 70000, Username: "ops", Origin: "csv:4"},
		{Label: "Existente", Address: "example.COM", Port: 22, Username: "root", Origin: "csv:5"},
		{Label: "Repetido", Address: "a.local", Port: 22, Username: "u", Origin: "csv:6"},
		{Label: "Repetido", Address: "b.local", Port: 22, Username: "u", Origin: "csv:7"},
		{Label: "Mesmo endpoint", Address: "dup.local", Port: 22, Username: "u", Origin: "csv:8"},
		{Label: "Mesmo endpoint 2", Address: "DUP.local", Port: 22, Username: "u", Origin: "csv:9"},
	}
	preview, err := Build(SourceCSV, "hosts.csv", rows, content)
	if err != nil {
		t.Fatal(err)
	}
	got := preview.View()
	if got.Rows[0].Address != "2001:db8::1" || got.Rows[0].Port != 22 || got.Rows[0].Label != "2001:db8::1" || !got.Rows[0].Selected {
		t.Fatalf("normalização = %+v", got.Rows[0])
	}
	assertRow(t, got.Rows[1], StateInvalid, WarningMissingAddress, false)
	assertRow(t, got.Rows[2], StateInvalid, WarningInvalidPort, false)
	assertRow(t, got.Rows[3], StateDuplicate, "", false)
	if got.Rows[3].DuplicateOf == nil || got.Rows[3].DuplicateOf.HostID == nil || *got.Rows[3].DuplicateOf.HostID != "host-existing" {
		t.Fatalf("duplicado do cofre = %+v", got.Rows[3].DuplicateOf)
	}
	assertWarning(t, got.Rows[4], WarningLabelRepeated)
	assertWarning(t, got.Rows[5], WarningLabelRepeated)
	assertRow(t, got.Rows[7], StateDuplicate, "", false)
	if got.Rows[7].DuplicateOf == nil || got.Rows[7].DuplicateOf.RowID == nil || *got.Rows[7].DuplicateOf.RowID != got.Rows[6].RowID {
		t.Fatalf("duplicado entre linhas = %+v", got.Rows[7].DuplicateOf)
	}
}

func TestPreviewEditsRevalidateAllRowsAndSelection(t *testing.T) {
	p, err := Build(SourceCSV, "x.csv", []CandidateRow{
		{Label: "A", Address: "same.local", Port: 22, Username: "u"},
		{Label: "B", Address: "SAME.local", Port: 22, Username: "u"},
		{Label: "Inválida", Address: "", Port: 22},
	}, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	second := p.View().Rows[1].RowID
	if err := p.UpdateRow(second, RowPatch{Address: ptr("other.local")}, model.EmptyContent()); err != nil {
		t.Fatal(err)
	}
	view := p.View()
	if view.Rows[0].State != StateOK || view.Rows[1].State != StateOK {
		t.Fatalf("revalidação = %+v", view.Rows)
	}
	invalidID := view.Rows[2].RowID
	selected := true
	if err := p.UpdateRow(invalidID, RowPatch{Selected: &selected}, model.EmptyContent()); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("seleção inválida = %v", err)
	}
	address := "fixed.local"
	label := "Corrigida"
	if err := p.UpdateRow(invalidID, RowPatch{Address: &address, Label: &label, Selected: &selected}, model.EmptyContent()); err != nil {
		t.Fatal(err)
	}
	if row := p.View().Rows[2]; row.State != StateOK || !row.Selected {
		t.Fatalf("linha corrigida = %+v", row)
	}
	p.SelectAll(false, nil)
	for _, row := range p.View().Rows {
		if row.Selected {
			t.Fatalf("SelectAll não desmarcou %+v", row)
		}
	}
}

func TestBuildRejectsMoreThanFiveThousandRows(t *testing.T) {
	rows := make([]CandidateRow, MaxRows+1)
	_, err := Build(SourceCSV, "grande.csv", rows, model.EmptyContent())
	if apperr.CodeOf(err) != apperr.ImportTooLarge {
		t.Fatalf("erro = %v", err)
	}
}

func assertRow(t *testing.T, row PreviewRow, state RowState, warning string, selected bool) {
	t.Helper()
	if row.State != state || row.Selected != selected {
		t.Fatalf("linha = %+v", row)
	}
	if warning != "" {
		assertWarning(t, row, warning)
	}
}

func assertWarning(t *testing.T, row PreviewRow, code string) {
	t.Helper()
	for _, warning := range row.Warnings {
		if warning.Code == code {
			return
		}
	}
	t.Fatalf("aviso %s ausente em %+v", code, row)
}

func ptr[T any](value T) *T { return &value }

package importer

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"golang.org/x/text/encoding/charmap"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func TestLoadMobaXtermSessionsAndNeverReadsPasswords(t *testing.T) {
	path := filepath.Join("testdata", "mobaxterm", "sessions.mxtsessions")
	preview, err := LoadMobaXterm(path, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	view := preview.View()
	if view.Kind != SourceMobaXterm || view.SourceLabel != "sessions.mxtsessions" {
		t.Fatalf("origem = %+v", view)
	}
	if got, want := labels(view.Rows), []string{"Core SSH", "Chave deslocada"}; !slices.Equal(got, want) {
		t.Fatalf("sessões SSH = %v, quer %v", got, want)
	}
	core := rowByLabel(t, view.Rows, "Core SSH")
	if core.Address != "192.0.2.10" || core.Port != 2222 || core.Username != "deploy" || !slices.Equal(core.GroupPath, []string{"Clientes", "Norte"}) {
		t.Fatalf("Core SSH = %+v", core)
	}
	if !strings.HasSuffix(filepath.ToSlash(keyPath(t, view, core)), "testdata/ppk/rsa-v3-none.ppk") {
		t.Fatalf("chave do Core = %q", keyPath(t, view, core))
	}
	deslocada := rowByLabel(t, view.Rows, "Chave deslocada")
	if deslocada.KeyRef != nil {
		t.Fatalf("campo inesperado não deve virar chave: %+v", deslocada)
	}
	assertWarningName(t, deslocada, WarningOptionIgnored, "chave não lida")
	if len(view.Ignored) != 2 || view.Ignored[0].Name != "Desktop NOC" || !strings.Contains(strings.ToLower(view.Ignored[0].Reason), "rdp") ||
		view.Ignored[1].Name != "Console legado" || !strings.Contains(strings.ToLower(view.Ignored[1].Reason), "telnet") {
		t.Fatalf("ignoradas = %+v", view.Ignored)
	}
	assertNoImportSecret(t, preview, "MOBAXTERM_PASSWORD_SENTINEL_DO_NOT_READ")
}

func TestLoadMobaXtermUTF8BOMAndWindows1252(t *testing.T) {
	fixture := filepath.Join("testdata", "mobaxterm", "MobaXterm.ini")
	raw, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		raw  []byte
	}{
		{name: "utf8-bom", raw: append([]byte("\xEF\xBB\xBF"), raw...)},
	}
	encoded, err := charmap.Windows1252.NewEncoder().Bytes(raw)
	if err != nil {
		t.Fatal(err)
	}
	tests = append(tests, struct {
		name string
		raw  []byte
	}{name: "windows-1252", raw: encoded})
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "MobaXterm.ini")
			if err := os.WriteFile(path, test.raw, 0o600); err != nil {
				t.Fatal(err)
			}
			preview, err := LoadMobaXterm(path, model.EmptyContent())
			if err != nil {
				t.Fatal(err)
			}
			row := rowByLabel(t, preview.View().Rows, "Roteador São Paulo")
			if row.Username != "operação" || !slices.Equal(row.GroupPath, []string{"Operação", "São Paulo"}) {
				t.Fatalf("acentos = %+v", row)
			}
			assertNoImportSecret(t, preview, "MOBAXTERM_INI_PASSWORD_SENTINEL_DO_NOT_READ")
		})
	}
}

func TestLoadMobaXtermRejectsUnreadableAndOversized(t *testing.T) {
	bad := filepath.Join(t.TempDir(), "bad.ini")
	if err := os.WriteFile(bad, []byte("[Passwords]\nsecret=value\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadMobaXterm(bad, model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportUnreadable {
		t.Fatalf("ilegível = %v", err)
	}
	large := filepath.Join(t.TempDir(), "large.ini")
	if err := os.WriteFile(large, make([]byte, MaxImportBytes+1), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadMobaXterm(large, model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportTooLarge {
		t.Fatalf("grande = %v", err)
	}
}

func assertNoImportSecret(t *testing.T, preview *ImportPreview, secret string) {
	t.Helper()
	raw, err := json.Marshal(preview.View())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), secret) {
		t.Fatalf("segredo apareceu na prévia: %s", raw)
	}
}

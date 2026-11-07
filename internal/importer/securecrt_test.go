package importer

import (
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func TestLoadSecureCRTSettingsAndNeverReadsPasswords(t *testing.T) {
	path := filepath.Join("testdata", "securecrt", "export-settings.xml")
	preview, err := LoadSecureCRT(path, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	view := preview.View()
	if view.Kind != SourceSecureCRT || view.SourceLabel != "export-settings.xml" || len(view.Rows) != 1 {
		t.Fatalf("origem = %+v", view)
	}
	row := view.Rows[0]
	if row.Label != "Core SSH2" || row.Address != "192.0.2.40" || row.Port != 2222 || row.Username != "deploy" ||
		!slices.Equal(row.GroupPath, []string{"Datacenter", "Borda"}) || row.Origin != "SecureCRT: Datacenter/Borda/Core SSH2" {
		t.Fatalf("sessão = %+v", row)
	}
	if !strings.HasSuffix(filepath.ToSlash(keyPath(t, view, row)), "testdata/ppk/ed25519-v3-none.ppk") {
		t.Fatalf("chave = %q", keyPath(t, view, row))
	}
	if len(view.Ignored) != 2 || view.Ignored[0].Name != "Acesso Telnet" || !strings.Contains(strings.ToLower(view.Ignored[0].Reason), "telnet") ||
		view.Ignored[1].Name != "Console Serial" || !strings.Contains(strings.ToLower(view.Ignored[1].Reason), "serial") {
		t.Fatalf("ignoradas = %+v", view.Ignored)
	}
	assertNoImportSecret(t, preview, "SECURECRT_PASSWORD_SENTINEL_DO_NOT_READ")
	assertNoImportSecret(t, preview, "SECURECRT_TELNET_SENTINEL_DO_NOT_READ")
}

func TestLoadSecureCRTUTF8BOMAndMalformedXML(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join("testdata", "securecrt", "export-settings.xml"))
	if err != nil {
		t.Fatal(err)
	}
	withBOM := filepath.Join(t.TempDir(), "settings.xml")
	if err := os.WriteFile(withBOM, append([]byte("\xEF\xBB\xBF"), raw...), 0o600); err != nil {
		t.Fatal(err)
	}
	if preview, err := LoadSecureCRT(withBOM, model.EmptyContent()); err != nil || len(preview.Rows) != 1 {
		t.Fatalf("BOM = %+v, %v", preview, err)
	}
	bad := filepath.Join(t.TempDir(), "bad.xml")
	if err := os.WriteFile(bad, []byte("<key name=\"Sessions\"><key>"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadSecureCRT(bad, model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportUnreadable {
		t.Fatalf("XML malformado = %v", err)
	}
}

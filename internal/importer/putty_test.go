package importer

import (
	"os"
	"path/filepath"
	"testing"

	"shellvault/internal/model"
)

type fakePuttyRegistry struct {
	wantRoot string
	sessions []RegistrySession
}

func (f fakePuttyRegistry) Sessions(root string) ([]RegistrySession, error) {
	if root != f.wantRoot {
		panic("raiz inesperada: " + root)
	}
	return f.sessions, nil
}

func TestLoadPuttyRegistryFiltersAndDecodesSessions(t *testing.T) {
	reader := fakePuttyRegistry{wantRoot: PuttyRegistryRoot, sessions: []RegistrySession{
		{Name: "Default%20Settings", Protocol: "ssh"},
		{Name: "Roteador%20Core", Protocol: "ssh", HostName: "admin@192.0.2.10", PortNumber: 2222, PublicKeyFile: `C:\keys\core.ppk`},
		{Name: "Console", Protocol: "serial"},
		{Name: "Legado", Protocol: "telnet"},
	}}
	preview, err := LoadPuttyRegistry(SourcePuTTY, reader, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	if preview.SourceLabel != "Registro do Windows (PuTTY)" || len(preview.Rows) != 1 || len(preview.Ignored) != 3 {
		t.Fatalf("prévia = %+v", preview.View())
	}
	row := preview.Rows[0]
	if row.Label != "Roteador Core" || row.Address != "192.0.2.10" || row.Port != 2222 || row.Username != "admin" || row.Origin != "PuTTY: Roteador Core" || row.KeyRef == nil {
		t.Fatalf("linha = %+v", row)
	}
	if len(preview.Keys) != 1 || preview.Keys[0].Path != `C:\keys\core.ppk` {
		t.Fatalf("chaves = %+v", preview.Keys)
	}
}

func TestLoadKiTTYRegistryUsesUserNameAndDefaultPort(t *testing.T) {
	reader := fakePuttyRegistry{wantRoot: KiTTYRegistryRoot, sessions: []RegistrySession{{Name: "Site", Protocol: "SSH", HostName: "host.example", UserName: "noc"}}}
	preview, err := LoadPuttyRegistry(SourceKiTTY, reader, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Rows) != 1 || preview.Rows[0].Port != 22 || preview.Rows[0].Username != "noc" || preview.Rows[0].Origin != "KiTTY: Site" {
		t.Fatalf("prévia = %+v", preview.View())
	}
}

func TestLoadKiTTYPortableSessionsFolder(t *testing.T) {
	root := t.TempDir()
	sessions := filepath.Join(root, "Sessions")
	if err := os.MkdirAll(sessions, 0o700); err != nil {
		t.Fatal(err)
	}
	ssh := "HostName\\2001:db8::10\\\nPortNumber\\2200\\\nUserName\\ops\\\nProtocol\\ssh\\\nPublicKeyFile\\C:\\keys\\edge.ppk\\\n"
	if err := os.WriteFile(filepath.Join(sessions, "Borda%20IPv6"), []byte(ssh), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(sessions, "Web"), []byte("HostName\\web.example\\\nProtocol\\raw\\\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	preview, err := LoadKiTTYPortable(root, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	if preview.SourceLabel != "KiTTY portátil" || len(preview.Rows) != 1 || len(preview.Ignored) != 1 {
		t.Fatalf("prévia = %+v", preview.View())
	}
	row := preview.Rows[0]
	if row.Label != "Borda IPv6" || row.Address != "2001:db8::10" || row.Port != 2200 || row.Username != "ops" || row.KeyRef == nil || row.Origin != "KiTTY portátil: Borda IPv6" {
		t.Fatalf("linha = %+v", row)
	}
}

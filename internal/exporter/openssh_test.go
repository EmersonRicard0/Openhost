package exporter_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"shellvault/internal/exporter"
	"shellvault/internal/importer"
	"shellvault/internal/model"
)

func exportContent() *model.Content {
	content := model.EmptyContent()
	content.Groups = []model.Group{
		{ID: "g1", Name: "Clientes"},
		{ID: "g2", Name: "Norte", ParentID: model.Ptr("g1")},
	}
	content.Hosts = []model.Host{
		{ID: "h1", Label: "OLT Centro", Address: "10.0.0.1", Port: 22, Username: "admin", GroupID: model.Ptr("g2")},
		{ID: "h2", Label: "olt-centro", Address: "10.0.0.2", Port: 2222, Username: "root", GroupID: model.Ptr("g2")},
		{ID: "h3", Label: "Olt Centro", Address: "10.0.0.3", Port: 22, Username: ""},
		{ID: "h4", Label: "db.prod", Address: "fe80::1", Port: 22, Username: "ops", CredentialID: model.Ptr("k1"), AuthMethod: model.AuthKey},
		{ID: "h5", Label: "Ação/Teste", Address: "acao.example", Port: 22, Username: "user name"},
	}
	return content
}

func TestMarshalOpenSSHBlocks(t *testing.T) {
	out := string(exporter.MarshalOpenSSH(exportContent()))

	for _, want := range []string{
		"# OpenHost: Clientes / Norte / OLT Centro\nHost OLT-Centro\n  HostName 10.0.0.1\n  User admin\n",
		"# OpenHost: Clientes / Norte / olt-centro\nHost olt-centro-2\n  HostName 10.0.0.2\n  Port 2222\n  User root\n",
		"# OpenHost: Olt Centro\nHost Olt-Centro-3\n  HostName 10.0.0.3\n",
		"# OpenHost: db.prod\nHost db.prod\n  HostName fe80::1\n  User ops\n",
		"Host A-o-Teste\n  HostName acao.example\n  User \"user name\"\n",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("faltou o bloco:\n%s\nsaída:\n%s", want, out)
		}
	}
	if strings.Contains(out, "Port 22\n") {
		t.Error("Port 22 não deve ser escrito")
	}
	if strings.Contains(out, "IdentityFile") {
		t.Error("chaves não são exportadas no formato OpenSSH")
	}
	if strings.Contains(out, "Host OLT-Centro\n  HostName 10.0.0.3") {
		t.Error("apelido repetido sem sufixo")
	}
}

func TestMarshalOpenSSHReimportsSameData(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	if err := os.WriteFile(path, exporter.MarshalOpenSSH(exportContent()), 0o600); err != nil {
		t.Fatal(err)
	}
	preview, err := importer.LoadOpenSSH(path, importer.OpenSSHOptions{HomeDir: dir, LocalUser: "local"}, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	type key struct {
		address, user string
		port          int
	}
	got := map[key]bool{}
	for _, row := range preview.View().Rows {
		got[key{row.Address, row.Username, row.Port}] = true
	}
	for _, host := range exportContent().Hosts {
		if !got[key{host.Address, host.Username, host.Port}] {
			t.Errorf("host %q não voltou igual; linhas: %+v", host.Label, preview.View().Rows)
		}
	}
	if n := len(preview.View().Rows); n != len(exportContent().Hosts) {
		t.Errorf("%d linhas, esperava %d", n, len(exportContent().Hosts))
	}
}

func TestWriteSSHConfigAppendBackupAndReplace(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	original := "Host antigo\r\n  HostName old.example\r\n"
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}
	first := time.Date(2026, 10, 26, 9, 15, 0, 0, time.Local)

	if err := exporter.WriteSSHConfig(path, []byte("Host a\n  HostName a.example\n"), exporter.SSHConfigAppend, first); err != nil {
		t.Fatal(err)
	}
	backup, err := os.ReadFile(path + ".bak-20261026-091500")
	if err != nil || string(backup) != original {
		t.Fatalf("cópia de segurança: %q, %v", backup, err)
	}
	got := readString(t, path)
	want := original + "\r\n# >>> OpenHost\r\nHost a\r\n  HostName a.example\r\n# <<< OpenHost\r\n"
	if got != want {
		t.Fatalf("acrescentar:\n%q\nesperado:\n%q", got, want)
	}

	// Reexportar troca só o trecho entre os marcadores, mantendo o que vem depois.
	if err := os.WriteFile(path, []byte(got+"Host depois\r\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := exporter.WriteSSHConfig(path, []byte("Host b\n"), exporter.SSHConfigAppend, first.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	got = readString(t, path)
	want = original + "\r\n# >>> OpenHost\r\nHost b\r\n# <<< OpenHost\r\nHost depois\r\n"
	if got != want {
		t.Fatalf("substituir:\n%q\nesperado:\n%q", got, want)
	}
	if _, err := os.Stat(path + ".bak-20261026-091600"); err != nil {
		t.Errorf("cada reexportação guarda uma cópia: %v", err)
	}
	assertNoTemp(t, dir)
}

func TestWriteSSHConfigAppendToMissingFileAndNewFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	now := time.Now()
	if err := exporter.WriteSSHConfig(path, []byte("Host a\n"), exporter.SSHConfigAppend, now); err != nil {
		t.Fatal(err)
	}
	if got := readString(t, path); got != "# >>> OpenHost\nHost a\n# <<< OpenHost\n" {
		t.Fatalf("arquivo novo com marcadores: %q", got)
	}
	matches, _ := filepath.Glob(path + ".bak-*")
	if len(matches) != 0 {
		t.Errorf("sem arquivo anterior não há cópia: %v", matches)
	}

	other := filepath.Join(dir, "hosts.config")
	if err := os.WriteFile(other, []byte("velho"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := exporter.WriteSSHConfig(other, []byte("Host a\n"), exporter.SSHConfigNewFile, now); err != nil {
		t.Fatal(err)
	}
	if got := readString(t, other); got != "Host a\n" {
		t.Fatalf("novo arquivo substitui o conteúdo: %q", got)
	}
	assertNoTemp(t, dir)
}

func TestWriteSSHConfigRefusesUnclosedMarker(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config")
	original := "# >>> OpenHost\nHost a\nHost do-usuario\n"
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := exporter.WriteSSHConfig(path, []byte("Host b\n"), exporter.SSHConfigAppend, time.Now()); err == nil {
		t.Fatal("marcador sem fim deveria ser recusado")
	}
	if got := readString(t, path); got != original {
		t.Fatalf("o arquivo não pode mudar: %q", got)
	}
}

func readString(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func assertNoTemp(t *testing.T, dir string) {
	t.Helper()
	matches, _ := filepath.Glob(filepath.Join(dir, "*.tmp"))
	if len(matches) != 0 {
		t.Errorf("temporários esquecidos: %v", matches)
	}
}

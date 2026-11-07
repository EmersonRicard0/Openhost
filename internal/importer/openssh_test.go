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

func TestOpenSSHConfigSemantics(t *testing.T) {
	home := copyOpenSSHFixture(t)
	config := filepath.Join(home, ".ssh", "config")
	preview, err := LoadOpenSSH(config, OpenSSHOptions{HomeDir: home, LocalUser: "local-user"}, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	view := preview.View()
	if got, want := labels(view.Rows), []string{"web1", "web2", "web3", "app1.interno", "secret.interno", "equals-host", "token-host", "quoted-host"}; !slices.Equal(got, want) {
		t.Fatalf("hosts concretos = %v, quer %v", got, want)
	}

	web1 := rowByLabel(t, view.Rows, "web1")
	if web1.Address != "edge.example.test" || web1.Port != 2222 || web1.Username != "deploy" {
		t.Fatalf("web1 = %+v", web1)
	}
	wantKey := filepath.Join(home, ".ssh", "keys", "edge.example.test-local-user")
	if keyPath(t, view, web1) != wantKey {
		t.Fatalf("IdentityFile web1 = %q, quer %q", keyPath(t, view, web1), wantKey)
	}
	assertWarningName(t, web1, WarningOptionIgnored, "ProxyJump")
	assertWarningName(t, web1, WarningOptionIgnored, "ProxyCommand")
	assertWarningName(t, web1, WarningOptionIgnored, "LocalForward")
	assertWarningName(t, web1, WarningOptionIgnored, "DynamicForward")
	if !strings.HasSuffix(web1.Origin, "config:2") {
		t.Fatalf("origin web1 = %q", web1.Origin)
	}

	app := rowByLabel(t, view.Rows, "app1.interno")
	if app.Address != "app-gateway.example.test" || app.Username != "noc" || app.Port != 2201 {
		t.Fatalf("padrão interno = %+v", app)
	}
	secret := rowByLabel(t, view.Rows, "secret.interno")
	if secret.Username != "fallback" || secret.Port != 22 {
		t.Fatalf("negação = %+v", secret)
	}
	equals := rowByLabel(t, view.Rows, "equals-host")
	if equals.Address != "equals.example.test" {
		t.Fatalf("chave=valor = %+v", equals)
	}
	assertWarningName(t, equals, WarningKeyNotFound, "")
	quoted := rowByLabel(t, view.Rows, "quoted-host")
	if quoted.Address != "quoted.example.test" || quoted.Username != "quoted-user" {
		t.Fatalf("aspas = %+v", quoted)
	}
	assertWarningName(t, quoted, WarningOptionIgnored, "RemoteForward")
	token := rowByLabel(t, view.Rows, "token-host")
	assertWarningName(t, token, WarningTokenUnsupported, "%x")

	if len(view.Ignored) != 1 || view.Ignored[0].Name != "Match" {
		t.Fatalf("Match ignorado = %+v", view.Ignored)
	}
	for _, row := range view.Rows {
		if row.Username == "should-not-be-read" || row.Port == 65000 {
			t.Fatalf("bloco Match aplicado: %+v", row)
		}
	}
}

func TestOpenSSHFirstObtainedValueWins(t *testing.T) {
	home := t.TempDir()
	sshDir := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDir, 0o700); err != nil {
		t.Fatal(err)
	}
	config := filepath.Join(sshDir, "config")
	text := "hOsT target\n  uSeR first\n  pOrT 2022\nHost target\n  User second\n  Port 2222\nHost *\n  User fallback\n"
	if err := os.WriteFile(config, []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
	preview, err := LoadOpenSSH(config, OpenSSHOptions{HomeDir: home, LocalUser: "local"}, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	row := rowByLabel(t, preview.View().Rows, "target")
	if row.Username != "first" || row.Port != 2022 {
		t.Fatalf("primeiro valor não venceu: %+v", row)
	}
}

func TestOpenSSHIncludeDepthAndUnreadableInput(t *testing.T) {
	home := t.TempDir()
	sshDir := filepath.Join(home, ".ssh")
	if err := os.MkdirAll(sshDir, 0o700); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 10; i++ {
		name := "config"
		if i > 0 {
			name = "level" + itoa(i)
		}
		next := ""
		if i < 9 {
			next = "Include level" + itoa(i+1) + "\n"
		}
		if err := os.WriteFile(filepath.Join(sshDir, name), []byte(next+"Host h"+itoa(i)+"\n  HostName h"+itoa(i)+".example.test\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	preview, err := LoadOpenSSH(filepath.Join(sshDir, "config"), OpenSSHOptions{HomeDir: home, LocalUser: "local"}, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.View().Rows) != 9 {
		t.Fatalf("profundidade de Include: %d hosts", len(preview.View().Rows))
	}
	if len(preview.View().FileWarnings) == 0 {
		t.Fatal("Include além de 8 níveis deveria gerar aviso")
	}
	_, err = LoadOpenSSH(filepath.Join(sshDir, "ausente"), OpenSSHOptions{HomeDir: home}, model.EmptyContent())
	if apperr.CodeOf(err) != apperr.ImportUnreadable {
		t.Fatalf("arquivo ausente = %v", err)
	}
}

func copyOpenSSHFixture(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	target := filepath.Join(home, ".ssh")
	if err := os.CopyFS(target, os.DirFS(filepath.Join("testdata", "openssh"))); err != nil {
		t.Fatal(err)
	}
	return home
}

func labels(rows []PreviewRow) []string {
	out := make([]string, len(rows))
	for i := range rows {
		out[i] = rows[i].Label
	}
	return out
}

func rowByLabel(t *testing.T, rows []PreviewRow, label string) PreviewRow {
	t.Helper()
	for _, row := range rows {
		if row.Label == label {
			return row
		}
	}
	t.Fatalf("host %q ausente", label)
	return PreviewRow{}
}

func keyPath(t *testing.T, view PreviewView, row PreviewRow) string {
	t.Helper()
	if row.KeyRef == nil {
		t.Fatalf("host %s sem chave", row.Label)
	}
	for _, key := range view.Keys {
		if key.Ref == *row.KeyRef {
			return key.Path
		}
	}
	t.Fatalf("chave %s ausente", *row.KeyRef)
	return ""
}

func assertWarningName(t *testing.T, row PreviewRow, code, name string) {
	t.Helper()
	for _, warning := range row.Warnings {
		if warning.Code == code && name == "" {
			return
		}
		if warning.Code == code && warning.Name != nil && strings.EqualFold(*warning.Name, name) {
			return
		}
	}
	t.Fatalf("aviso %s/%s ausente em %+v", code, name, row)
}

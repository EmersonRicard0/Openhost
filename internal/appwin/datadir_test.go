package appwin

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDataDirDefaultsByBuildType(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SHELLVAULT_DATA_DIR", "")
	t.Setenv("APPDATA", filepath.Join(root, "appdata"))
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "xdg"))
	t.Setenv("HOME", filepath.Join(root, "home"))

	base, err := os.UserConfigDir()
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name      string
		isRelease bool
		dirName   string
	}{
		{name: "release", isRelease: true, dirName: "ShellVault"},
		{name: "development", isRelease: false, dirName: "ShellVault-dev"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			want := filepath.Join(base, tc.dirName)
			got, err := DataDir(tc.isRelease)
			if err != nil || got != want {
				t.Fatalf("got %q, %v; want %q", got, err, want)
			}
		})
	}
}

func TestDataDirOverride(t *testing.T) {
	want := filepath.Join(t.TempDir(), "dados")
	t.Setenv("SHELLVAULT_DATA_DIR", want)
	for _, isRelease := range []bool{false, true} {
		got, err := DataDir(isRelease)
		if err != nil || got != want {
			t.Fatalf("isRelease=%t: got %q, %v", isRelease, got, err)
		}
	}
	if st, err := os.Stat(want); err != nil || !st.IsDir() {
		t.Fatal("diretório não foi criado")
	}
}

func TestDataDirRejectsRelative(t *testing.T) {
	t.Setenv("SHELLVAULT_DATA_DIR", "relativo")
	for _, isRelease := range []bool{false, true} {
		if _, err := DataDir(isRelease); err == nil {
			t.Fatalf("isRelease=%t: aceitou caminho relativo", isRelease)
		}
	}
}

func TestWebViewArgsDisableCrashDumps(t *testing.T) {
	got := strings.Join(WebViewArgs([]string{"--x"}), " ")
	for _, a := range []string{"--disable-breakpad", "--disable-crash-reporter", "--x"} {
		if !strings.Contains(got, a) {
			t.Errorf("faltou %s em %q", a, got)
		}
	}
}

func TestClearWebViewAutofillData(t *testing.T) {
	dataDir := t.TempDir()
	profile := filepath.Join(WebViewDir(dataDir), "EBWebView", "Default")
	if err := os.MkdirAll(profile, 0o700); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Web Data", "Web Data-journal", "Web Data-wal", "Web Data-shm", "Cookies"} {
		if err := os.WriteFile(filepath.Join(profile, name), []byte("segredo"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := ClearWebViewAutofillData(dataDir); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Web Data", "Web Data-journal", "Web Data-wal", "Web Data-shm"} {
		if _, err := os.Stat(filepath.Join(profile, name)); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s não foi removido: %v", name, err)
		}
	}
	if _, err := os.Stat(filepath.Join(profile, "Cookies")); err != nil {
		t.Fatalf("arquivo não relacionado foi removido: %v", err)
	}
}

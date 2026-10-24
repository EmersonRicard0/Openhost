package appwin

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDataDirOverride(t *testing.T) {
	want := filepath.Join(t.TempDir(), "dados")
	t.Setenv("SHELLVAULT_DATA_DIR", want)
	got, err := DataDir()
	if err != nil || got != want {
		t.Fatalf("got %q, %v", got, err)
	}
	if st, err := os.Stat(want); err != nil || !st.IsDir() {
		t.Fatal("diretório não foi criado")
	}
}

func TestDataDirRejectsRelative(t *testing.T) {
	t.Setenv("SHELLVAULT_DATA_DIR", "relativo")
	if _, err := DataDir(); err == nil {
		t.Fatal("aceitou caminho relativo")
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

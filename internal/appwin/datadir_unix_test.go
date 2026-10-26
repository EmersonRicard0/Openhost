//go:build !windows

package appwin

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDataDirClosesLooseExistingDirectory(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "ShellVault")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SHELLVAULT_DATA_DIR", dir)
	if _, err := DataDir(); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if mode := info.Mode().Perm(); mode != 0o700 {
		t.Fatalf("modo %o, esperado 700", mode)
	}
}

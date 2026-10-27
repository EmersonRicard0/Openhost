//go:build linux

package updater

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReplaceAppImageReplacesOnlyAtFinalRename(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "OpenHost.AppImage")
	if err := os.WriteFile(target, []byte("old"), 0o755); err != nil {
		t.Fatal(err)
	}

	badSource := filepath.Join(directory, "bad-source")
	if err := os.Mkdir(badSource, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := replaceAppImage(badSource, target); err == nil {
		t.Fatal("fonte inválida deveria falhar")
	}
	if data, err := os.ReadFile(target); err != nil || string(data) != "old" {
		t.Fatalf("original alterado antes do rename final: %q, %v", data, err)
	}

	source := filepath.Join(directory, "download.AppImage")
	if err := os.WriteFile(source, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := replaceAppImage(source, target); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(target)
	if err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(target); err != nil || string(data) != "new" {
		t.Fatalf("conteúdo final = %q, %v", data, err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Fatalf("modo final = %o", info.Mode().Perm())
	}
}

//go:build !windows

package vault

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"
)

// Mesmo com umask 000, o banco e o WAL ficam 0600 (FR-403).
func TestVaultFilesOwnerOnly(t *testing.T) {
	old := syscall.Umask(0)
	t.Cleanup(func() { syscall.Umask(old) })
	dir := t.TempDir()
	store, err := Open(dir, TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	for _, name := range []string{DBFile, DBFile + "-wal", DBFile + "-shm"} {
		info, err := os.Stat(filepath.Join(dir, name))
		if os.IsNotExist(err) && name != DBFile {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		if mode := info.Mode().Perm(); mode != 0o600 {
			t.Errorf("%s com modo %o, esperado 600", name, mode)
		}
	}
}

// Um banco antigo criado com 0644 é corrigido ao abrir.
func TestVaultFixesLooseExistingDB(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(dir, TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	_ = store.Close()
	path := filepath.Join(dir, DBFile)
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	store, err = Open(dir, TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if mode := info.Mode().Perm(); mode != 0o600 {
		t.Fatalf("modo %o depois de reabrir, esperado 600", mode)
	}
}

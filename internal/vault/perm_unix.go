//go:build !windows

package vault

import (
	"errors"
	"os"
)

// restrictFiles deixa o banco e os arquivos do WAL só para o dono (specs/004-linux-macos, R8).
// O SQLite cria o banco com 0644 e o -wal/-shm herdam o modo dele; criando antes com 0600 e
// corrigindo os que já existem, nada fica legível para outros usuários, mesmo com umask 000.
func restrictFiles(path string) error {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	for _, name := range []string{path, path + "-wal", path + "-shm"} {
		if err := os.Chmod(name, 0o600); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

//go:build !windows

package appwin

import "os"

// restrictDir fecha para o dono um diretório de dados que já exista mais aberto (R8): o
// MkdirAll só aplica 0700 ao criar.
func restrictDir(dir string) error {
	info, err := os.Stat(dir)
	if err != nil {
		return err
	}
	if info.Mode().Perm()&0o077 != 0 {
		return os.Chmod(dir, 0o700)
	}
	return nil
}

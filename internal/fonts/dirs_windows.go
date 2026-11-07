package fonts

import (
	"os"
	"path/filepath"
)

// defaultDirectories: fontes do Windows e as instaladas só para o usuário.
func defaultDirectories() []string {
	windowsDir := os.Getenv("WINDIR")
	if windowsDir == "" {
		windowsDir = os.Getenv("SystemRoot")
	}
	dirs := make([]string, 0, 2)
	if windowsDir != "" {
		dirs = append(dirs, filepath.Join(windowsDir, "Fonts"))
	}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		dirs = append(dirs, filepath.Join(local, "Microsoft", "Windows", "Fonts"))
	}
	return dirs
}

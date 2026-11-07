package fonts

import (
	"os"
	"path/filepath"
)

// defaultDirectories: fontes do sistema, as instaladas para todos e as do usuário (R7).
func defaultDirectories() []string {
	dirs := []string{"/System/Library/Fonts", "/Library/Fonts"}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		dirs = append(dirs, filepath.Join(home, "Library", "Fonts"))
	}
	return dirs
}

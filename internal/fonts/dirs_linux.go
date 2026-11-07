package fonts

import (
	"os"
	"path/filepath"
)

// defaultDirectories: os mesmos lugares que o fontconfig procura por padrão (R7).
func defaultDirectories() []string {
	var dirs []string
	if data := os.Getenv("XDG_DATA_HOME"); data != "" {
		dirs = append(dirs, filepath.Join(data, "fonts"))
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		dirs = append(dirs, filepath.Join(home, ".local", "share", "fonts"), filepath.Join(home, ".fonts"))
	}
	return append(dirs, "/usr/share/fonts", "/usr/local/share/fonts")
}

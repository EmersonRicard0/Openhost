//go:build darwin

package appwin

import (
	"context"
	"os/exec"
	"time"
)

const defaultsTimeout = 500 * time.Millisecond

// DefaultsAppearanceReader lê a aparência do macOS com `defaults read` (R3). O monitor chama a
// cada segundo; cada leitura tem tempo limite curto e saída validada em macAppearance.
type DefaultsAppearanceReader struct{}

// SystemAppearanceReader é o leitor de aparência deste sistema.
func SystemAppearanceReader() AppearanceReader { return DefaultsAppearanceReader{} }

func (DefaultsAppearanceReader) ReadAppearance() (SystemAppearance, error) {
	return macAppearance(readDefaults), nil
}

func readDefaults(domain, key string) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), defaultsTimeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/usr/bin/defaults", "read", domain, key).Output()
	if err != nil {
		return "", false
	}
	return string(out), true
}

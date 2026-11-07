//go:build windows

package updater

import (
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const windowsUninstallKey = `Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenHostOpenHost`

func DetectInstall() Install {
	if developmentBuild() {
		return Install{Kind: InstallDev}
	}
	executable, err := os.Executable()
	if err != nil {
		return Install{Kind: InstallUnmanaged}
	}
	executable, _ = filepath.Abs(executable)
	return classifyWindowsInstall(executable, windowsDisplayIcons())
}

func classifyWindowsInstall(executable string, registeredExecutables []string) Install {
	target := filepath.Clean(executable)
	for _, registered := range registeredExecutables {
		registered = strings.Trim(strings.TrimSpace(registered), `"`)
		if registered != "" && strings.EqualFold(filepath.Clean(registered), target) {
			return Install{Kind: InstallNSIS, Target: target, Writable: true}
		}
	}
	return Install{Kind: InstallUnmanaged, Target: target}
}

func windowsDisplayIcons() []string {
	var result []string
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		key, err := registry.OpenKey(root, windowsUninstallKey, registry.QUERY_VALUE|registry.WOW64_64KEY)
		if err != nil {
			continue
		}
		value, _, readErr := key.GetStringValue("DisplayIcon")
		_ = key.Close()
		if readErr == nil && strings.TrimSpace(value) != "" {
			result = append(result, value)
		}
	}
	return result
}

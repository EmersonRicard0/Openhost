//go:build windows

package updater

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
	for _, root := range []string{"HKCU", "HKLM"} {
		output, err := exec.Command("reg", "query", root+`\`+windowsUninstallKey, "/v", "DisplayIcon", "/reg:64").Output()
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(output), "\n") {
			if index := strings.Index(line, "REG_SZ"); index >= 0 {
				result = append(result, strings.TrimSpace(line[index+len("REG_SZ"):]))
			}
		}
	}
	return result
}

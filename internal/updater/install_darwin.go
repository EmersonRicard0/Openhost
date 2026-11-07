//go:build darwin

package updater

import (
	"os"
	"path/filepath"
	"strings"
)

func DetectInstall() Install {
	if developmentBuild() {
		return Install{Kind: InstallDev}
	}
	executable, err := os.Executable()
	if err != nil {
		return Install{Kind: InstallUnmanaged}
	}
	app := darwinAppPath(executable)
	writable := app != "" && writableDir(filepath.Dir(app))
	return classifyDarwinInstall(executable, writable)
}

func classifyDarwinInstall(executable string, writable bool) Install {
	app := darwinAppPath(executable)
	if app == "" {
		return Install{Kind: InstallUnmanaged, Target: filepath.Clean(executable)}
	}
	if writable {
		return Install{Kind: InstallApp, Target: app, Writable: true}
	}
	return Install{Kind: InstallAppReadonly, Target: app, ManualCommand: "abra o arquivo .dmg e arraste OpenHost para Aplicativos"}
}

func darwinAppPath(executable string) string {
	clean := filepath.Clean(executable)
	marker := ".app" + string(filepath.Separator) + "Contents" + string(filepath.Separator) + "MacOS"
	index := strings.LastIndex(clean, marker)
	if index < 0 {
		return ""
	}
	return clean[:index+len(".app")]
}

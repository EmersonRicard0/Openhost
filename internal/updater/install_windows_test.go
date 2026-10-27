//go:build windows

package updater

import (
	"path/filepath"
	"testing"
)

func TestClassifyWindowsInstall(t *testing.T) {
	exe := filepath.Clean(`C:\Program Files\OpenHost\OpenHost.exe`)
	installed := classifyWindowsInstall(exe, []string{`C:\Program Files\OpenHost\OpenHost.exe`})
	if installed.Kind != InstallNSIS || installed.Target != exe || !installed.Writable {
		t.Fatalf("instalação NSIS = %+v", installed)
	}
	portable := classifyWindowsInstall(filepath.Clean(`D:\Tools\OpenHost.exe`), nil)
	if portable.Kind != InstallUnmanaged || portable.Writable {
		t.Fatalf("instalação portátil = %+v", portable)
	}
}

func TestDetectInstallWithoutVersionIsDev(t *testing.T) {
	previous := BuildVersion
	BuildVersion = ""
	t.Cleanup(func() { BuildVersion = previous })
	if got := DetectInstall(); got.Kind != InstallDev {
		t.Fatalf("sem versão = %+v", got)
	}
}

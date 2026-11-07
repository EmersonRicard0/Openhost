package updater

import (
	"os"
	"strings"
)

// BuildVersion é preenchida no build de release via -ldflags -X. Vazia ou inválida identifica
// execução de desenvolvimento, que nunca deve oferecer atualização.
var BuildVersion string

type InstallKind string

const (
	InstallNSIS        InstallKind = "nsis"
	InstallApp         InstallKind = "app"
	InstallAppReadonly InstallKind = "app-readonly"
	InstallAppImage    InstallKind = "appimage"
	InstallDEB         InstallKind = "deb"
	InstallRPM         InstallKind = "rpm"
	InstallUnmanaged   InstallKind = "unmanaged"
	InstallDev         InstallKind = "dev"
)

type Install struct {
	Kind          InstallKind `json:"kind"`
	Target        string      `json:"target"`
	Writable      bool        `json:"writable"`
	ManualCommand string      `json:"manualCommand,omitempty"`
}

func CurrentVersion() string { return strings.TrimPrefix(strings.TrimSpace(BuildVersion), "v") }

func developmentBuild() bool {
	if e2eBuild {
		return true
	}
	_, valid := parseSemver(CurrentVersion())
	return !valid
}

func writableFile(path string) bool {
	file, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		return false
	}
	return file.Close() == nil
}

func writableDir(path string) bool {
	file, err := os.CreateTemp(path, ".openhost-write-test-*")
	if err != nil {
		return false
	}
	name := file.Name()
	closeErr := file.Close()
	removeErr := os.Remove(name)
	return closeErr == nil && removeErr == nil
}

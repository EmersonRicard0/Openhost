//go:build windows

package bridge

import (
	"os/exec"
	"syscall"
)

func launchUpdateHelper(helper, manifest string) error {
	command := exec.Command(helper, "--apply-update", manifest)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x00000008 | 0x00000200}
	return command.Start()
}

func openUpdateFolder(path string) error {
	// Explorer é programa de janela (não abre console); HideWindow esconderia a própria pasta.
	return exec.Command("explorer.exe", path).Start()
}

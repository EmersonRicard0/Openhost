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
	return exec.Command("explorer.exe", path).Start()
}

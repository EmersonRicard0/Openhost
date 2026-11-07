//go:build linux

package bridge

import (
	"os/exec"
	"syscall"
)

func launchUpdateHelper(helper, manifest string) error {
	command := exec.Command(helper, "--apply-update", manifest)
	command.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return command.Start()
}

func openUpdateFolder(path string) error {
	return exec.Command("xdg-open", path).Start()
}

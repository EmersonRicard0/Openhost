//go:build windows

package updater

import (
	"errors"
	"os/exec"
	"syscall"
)

func applyPlatform(manifest ApplyManifest) error {
	if manifest.Install != InstallNSIS {
		return ErrUnsafeManifest
	}
	return exec.Command(manifest.PackagePath, "/S").Run()
}

func waitForProcess(pid int) error {
	const synchronize = 0x00100000
	handle, err := syscall.OpenProcess(synchronize, false, uint32(pid))
	if err != nil {
		if errors.Is(err, syscall.Errno(87)) {
			return nil
		}
		return err
	}
	defer syscall.CloseHandle(handle)
	const (
		waitObject0 = 0x00000000
		waitTimeout = 0x00000102
	)
	result, err := syscall.WaitForSingleObject(handle, 60_000)
	if err != nil {
		return err
	}
	if result == waitTimeout {
		return errors.New("timed out waiting for app to exit")
	}
	if result != waitObject0 {
		return errors.New("unexpected process wait result")
	}
	return nil
}

func relaunchDetached(arguments []string) error {
	command := exec.Command(arguments[0], arguments[1:]...)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x00000008 | 0x00000200}
	return command.Start()
}

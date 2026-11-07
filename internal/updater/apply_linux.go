//go:build linux

package updater

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
)

func applyPlatform(manifest ApplyManifest) error {
	if manifest.Install != InstallAppImage {
		return ErrUnsafeManifest
	}
	return replaceAppImage(manifest.PackagePath, manifest.TargetPath)
}

func replaceAppImage(source, target string) error {
	temporary, err := os.CreateTemp(filepath.Dir(target), ".openhost-appimage-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	input, err := os.Open(source)
	if err != nil {
		_ = temporary.Close()
		return err
	}
	_, copyErr := temporary.ReadFrom(input)
	closeInputErr := input.Close()
	if copyErr == nil {
		copyErr = closeInputErr
	}
	if copyErr == nil {
		copyErr = temporary.Chmod(0o755)
	}
	if copyErr == nil {
		copyErr = temporary.Sync()
	}
	closeErr := temporary.Close()
	if copyErr == nil {
		copyErr = closeErr
	}
	if copyErr != nil {
		return copyErr
	}
	return os.Rename(temporaryPath, target)
}

func waitForProcess(pid int) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		err := process.Signal(syscall.Signal(0))
		if errors.Is(err, os.ErrProcessDone) || errors.Is(err, syscall.ESRCH) {
			return nil
		}
		if err != nil && !errors.Is(err, syscall.EPERM) {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
	return errors.New("timed out waiting for app to exit")
}

func relaunchDetached(arguments []string) error {
	command := exec.Command(arguments[0], arguments[1:]...)
	command.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	return command.Start()
}

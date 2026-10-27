//go:build darwin

package updater

import (
	"errors"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func applyPlatform(manifest ApplyManifest) error {
	if manifest.Install != InstallApp {
		return ErrUnsafeManifest
	}
	mountPoint, err := os.MkdirTemp(filepath.Dir(manifest.PackagePath), ".openhost-dmg-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(mountPoint)
	if err := exec.Command("/usr/bin/hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mountPoint, manifest.PackagePath).Run(); err != nil {
		return err
	}
	defer exec.Command("/usr/bin/hdiutil", "detach", mountPoint).Run()
	entries, err := os.ReadDir(mountPoint)
	if err != nil {
		return err
	}
	var sourceApp string
	for _, entry := range entries {
		if entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".app") {
			if sourceApp != "" {
				return errors.New("multiple apps in dmg")
			}
			sourceApp = filepath.Join(mountPoint, entry.Name())
		}
	}
	if sourceApp == "" {
		return errors.New("app missing from dmg")
	}
	stage, err := os.MkdirTemp(filepath.Dir(manifest.TargetPath), ".openhost-app-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	if err := copyTree(sourceApp, stage); err != nil {
		return err
	}
	backup := manifest.TargetPath + ".openhost-previous"
	_ = os.RemoveAll(backup)
	if err := os.Rename(manifest.TargetPath, backup); err != nil {
		return err
	}
	if err := os.Rename(stage, manifest.TargetPath); err != nil {
		_ = os.Rename(backup, manifest.TargetPath)
		return err
	}
	return os.RemoveAll(backup)
}

func copyTree(source, target string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		destination := filepath.Join(target, relative)
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			link, err := os.Readlink(path)
			if err != nil {
				return err
			}
			return os.Symlink(link, destination)
		}
		if entry.IsDir() {
			return os.MkdirAll(destination, info.Mode().Perm())
		}
		return copyFile(path, destination, info.Mode().Perm())
	})
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

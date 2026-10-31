//go:build linux

package updater

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
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
	appImage := os.Getenv("APPIMAGE")
	appImageWritable := appImage != "" && writableFile(appImage)
	var dpkgOutput, rpmOutput string
	clean := filepath.Clean(executable)
	if clean == "/usr/bin/openhost" || clean == "/usr/local/bin/openhost" {
		if output, err := exec.Command("dpkg", "-S", clean).Output(); err == nil {
			dpkgOutput = string(output)
		} else if output, err := exec.Command("rpm", "-qf", clean).Output(); err == nil {
			rpmOutput = string(output)
		}
	}
	return classifyLinuxInstall(clean, appImage, appImageWritable, dpkgOutput, rpmOutput)
}

func classifyLinuxInstall(executable, appImage string, appImageWritable bool, dpkgOutput, rpmOutput string) Install {
	if appImage != "" && appImageWritable {
		return Install{Kind: InstallAppImage, Target: filepath.Clean(appImage), Writable: true}
	}
	if executable == "/usr/bin/openhost" || executable == "/usr/local/bin/openhost" {
		if strings.TrimSpace(dpkgOutput) != "" {
			return Install{Kind: InstallDEB, Target: executable, ManualCommand: debCommand()}
		}
		if strings.TrimSpace(rpmOutput) != "" {
			return Install{Kind: InstallRPM, Target: executable, ManualCommand: rpmCommand()}
		}
	}
	return Install{Kind: InstallUnmanaged, Target: executable}
}

func debCommand() string {
	arch := runtime.GOARCH
	return "sudo apt install ./openhost_" + CurrentVersion() + "_" + arch + ".deb"
}

func rpmCommand() string {
	arch := map[string]string{"amd64": "x86_64", "arm64": "aarch64"}[runtime.GOARCH]
	return "sudo dnf install ./openhost-" + CurrentVersion() + "-1." + arch + ".rpm"
}

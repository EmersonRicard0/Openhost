//go:build linux

package updater

import "testing"

func TestClassifyLinuxInstall(t *testing.T) {
	if got := classifyLinuxInstall("/tmp/OpenHost.AppImage", "/tmp/OpenHost.AppImage", true, "", ""); got.Kind != InstallAppImage || !got.Writable {
		t.Fatalf("AppImage = %+v", got)
	}
	if got := classifyLinuxInstall("/usr/bin/openhost", "", false, "openhost: /usr/bin/openhost", ""); got.Kind != InstallDEB || got.ManualCommand == "" {
		t.Fatalf("deb = %+v", got)
	}
	if got := classifyLinuxInstall("/usr/local/bin/openhost", "", false, "", "openhost-0.5.0-1.x86_64"); got.Kind != InstallRPM || got.ManualCommand == "" {
		t.Fatalf("rpm = %+v", got)
	}
}

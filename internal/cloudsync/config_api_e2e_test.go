//go:build e2e

package cloudsync

import "testing"

func TestE2EDriveBaseAcceptsOnlyLoopback(t *testing.T) {
	old := e2eDriveAPIBase
	t.Cleanup(func() { e2eDriveAPIBase = old })
	if err := SetDriveAPIBaseForTest("http://127.0.0.1:8124"); err != nil {
		t.Fatal(err)
	}
	if configuredDriveAPIBase() != "http://127.0.0.1:8124" {
		t.Fatalf("base = %q", configuredDriveAPIBase())
	}
	if err := SetDriveAPIBaseForTest("https://example.com"); err == nil {
		t.Fatal("host externo foi aceito")
	}
}

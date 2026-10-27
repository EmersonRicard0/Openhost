//go:build e2e

package testsvc

import (
	"os"
	"testing"
)

func TestSetDialogPathChangesTheDialogFile(t *testing.T) {
	t.Setenv("SHELLVAULT_TEST_DIALOG_PATH", "a.json")
	svc := New(nil, nil, nil, nil)
	if err := svc.SetDialogPath(`C:\tmp\b.itermcolors`); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); got != `C:\tmp\b.itermcolors` {
		t.Fatalf("SHELLVAULT_TEST_DIALOG_PATH = %q", got)
	}
}

func TestUpdateControls(t *testing.T) {
	var sourceURL, publicKey, installKind string
	svc := New(nil, nil,
		func(url, key string) error { sourceURL, publicKey = url, key; return nil },
		func(kind string) error { installKind = kind; return nil },
	)
	if err := svc.SetUpdateSource("http://127.0.0.1:8123/releases", "cHVibGlj"); err != nil {
		t.Fatal(err)
	}
	if err := svc.SetInstallKind("appimage"); err != nil {
		t.Fatal(err)
	}
	if sourceURL != "http://127.0.0.1:8123/releases" || publicKey != "cHVibGlj" || installKind != "appimage" {
		t.Fatalf("source=%q key=%q install=%q", sourceURL, publicKey, installKind)
	}
}

//go:build e2e

package testsvc

import (
	"os"
	"testing"
)

func TestSetDialogPathChangesTheDialogFile(t *testing.T) {
	t.Setenv("SHELLVAULT_TEST_DIALOG_PATH", "a.json")
	svc := New(nil, nil)
	if err := svc.SetDialogPath(`C:\tmp\b.itermcolors`); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); got != `C:\tmp\b.itermcolors` {
		t.Fatalf("SHELLVAULT_TEST_DIALOG_PATH = %q", got)
	}
}

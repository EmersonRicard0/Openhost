//go:build !windows

package bridge

import "shellvault/internal/localpty"

func testAlternativeLocalShell() localpty.LocalShell {
	return localpty.LocalShell{ID: "test-shell", Label: "test-shell", Kind: localpty.KindUnix}
}

func testOpenLocalShellID() string { return localpty.DefaultShellID() }

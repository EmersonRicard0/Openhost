//go:build windows

package bridge

import "shellvault/internal/localpty"

func testAlternativeLocalShell() localpty.LocalShell {
	return localpty.LocalShell{ID: "wsl:Ubuntu", Label: "Ubuntu", Kind: localpty.KindWSL}
}

func testOpenLocalShellID() string { return "cmd" }

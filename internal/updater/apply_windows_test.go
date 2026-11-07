//go:build windows

package updater

import (
	"runtime"
	"testing"
	"unsafe"
)

// SHELLEXECUTEINFOW tem 112 bytes no Windows x64 e 60 no x86; tamanho errado faz o
// ShellExecuteExW recusar a chamada.
func TestShellExecuteInfoMatchesWindowsLayout(t *testing.T) {
	want := map[string]uintptr{"amd64": 112, "arm64": 112, "386": 60}[runtime.GOARCH]
	if want == 0 {
		t.Skip("arquitetura sem tamanho conhecido")
	}
	if got := unsafe.Sizeof(shellExecuteInfo{}); got != want {
		t.Fatalf("sizeof(shellExecuteInfo) = %d, want %d", got, want)
	}
}

//go:build darwin

package updater

import "testing"

func TestClassifyDarwinInstall(t *testing.T) {
	writable := classifyDarwinInstall("/Applications/OpenHost.app/Contents/MacOS/shellvault", true)
	if writable.Kind != InstallApp || writable.Target != "/Applications/OpenHost.app" || !writable.Writable {
		t.Fatalf("app gravável = %+v", writable)
	}
	readonly := classifyDarwinInstall("/Applications/OpenHost.app/Contents/MacOS/shellvault", false)
	if readonly.Kind != InstallAppReadonly || readonly.Writable {
		t.Fatalf("app somente leitura = %+v", readonly)
	}
	if got := classifyDarwinInstall("/tmp/shellvault", true); got.Kind != InstallUnmanaged {
		t.Fatalf("binário solto = %+v", got)
	}
}

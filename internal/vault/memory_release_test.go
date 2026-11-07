package vault

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestPasswordOperationsReleaseDerivedMemoryOnceOutsideStoreLock(t *testing.T) {
	store := openTest(t, t.TempDir())
	var calls atomic.Int32
	called := make(chan struct{}, 4)
	store.releaseMemory = func() {
		// Status precisa adquirir o lock: se o gancho rodar ainda dentro da operação, o teste trava.
		_ = store.Status()
		calls.Add(1)
		called <- struct{}{}
	}

	wantOneRelease := func(name string, operation func() error) {
		t.Helper()
		before := calls.Load()
		if err := operation(); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		select {
		case <-called:
		case <-time.After(time.Second):
			t.Fatalf("%s não chamou o gancho de devolução de memória", name)
		}
		if got := calls.Load() - before; got != 1 {
			t.Fatalf("%s chamou o gancho %d vezes; esperado 1", name, got)
		}
		select {
		case <-called:
			t.Fatalf("%s chamou o gancho mais de uma vez", name)
		case <-time.After(20 * time.Millisecond):
		}
	}

	wantOneRelease("Create", func() error { return store.Create(pw, pw) })
	store.Lock()
	wantOneRelease("Unlock", func() error { return store.Unlock(pw) })
	wantOneRelease("ChangePassword", func() error {
		return store.ChangePassword(pw, "nova-senha-2", "nova-senha-2")
	})
}

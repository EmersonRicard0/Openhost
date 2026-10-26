//go:build !windows

package localpty

import (
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"
)

// PTY Unix com o bash de login (specs/004-linux-macos, T016). Roda no CI de Linux e macOS.

type unixBuf struct {
	mu sync.Mutex
	b  strings.Builder
}

func (b *unixBuf) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.Write(p)
}

func (b *unixBuf) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.b.String()
}

func waitUnixText(t *testing.T, b *unixBuf, text string) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for !strings.Contains(b.String(), text) {
		if time.Now().After(deadline) {
			t.Fatalf("%q não apareceu em %q", text, b.String())
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func startBash(t *testing.T) (*Process, *unixBuf, chan struct{}) {
	t.Helper()
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skip("sem bash neste sistema")
	}
	p, err := New("bash")
	if err != nil {
		t.Fatal(err)
	}
	var out unixBuf
	if err := p.Start(80, 24, &out); err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	go func() {
		_ = p.Wait()
		close(done)
	}()
	t.Cleanup(func() { _ = p.Close() })
	return p, &out, done
}

func TestUnixPTYTermResizeInterruptAndExit(t *testing.T) {
	p, out, done := startBash(t)

	// Marcadores montados pelo shell, para não casar com o eco do próprio comando.
	_ = p.Write([]byte("echo \"term=$TERM\"'-fim'\n"))
	waitUnixText(t, out, "term=xterm-256color-fim")

	if err := p.Resize(100, 30); err != nil {
		t.Fatal(err)
	}
	_ = p.Write([]byte("echo \"tam=$(stty size)\"'-fim'\n"))
	waitUnixText(t, out, "tam=30 100-fim")

	// Ctrl+C interrompe o sleep e o shell volta a responder.
	_ = p.Write([]byte("sleep 100\n"))
	time.Sleep(300 * time.Millisecond)
	_ = p.Write([]byte("\x03"))
	_ = p.Write([]byte("echo \"volta\"'-fim'\n"))
	waitUnixText(t, out, "volta-fim")

	_ = p.Write([]byte("exit 3\n"))
	select {
	case <-done:
	case <-time.After(15 * time.Second):
		t.Fatal("Wait não voltou depois do exit")
	}
	if c := p.ExitCode(); c == nil || *c != 3 {
		t.Fatalf("código de saída %v, esperado 3", c)
	}
}

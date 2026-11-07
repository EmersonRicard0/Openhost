//go:build smoke

package smokesvc

import (
	"testing"
	"time"
)

func TestReadyQuitsOnce(t *testing.T) {
	calls := make(chan struct{}, 4)
	s := newSmoke(func() { calls <- struct{}{} })
	s.Ready()
	s.Ready()
	select {
	case <-calls:
	case <-time.After(time.Second):
		t.Fatal("Ready não encerrou o app")
	}
	select {
	case <-calls:
		t.Fatal("Ready encerrou duas vezes")
	case <-time.After(100 * time.Millisecond):
	}
}

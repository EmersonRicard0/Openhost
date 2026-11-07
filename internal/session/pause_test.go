package session

import (
	"testing"
	"time"
)

func TestPauseStopsOutputUntilResumeWithoutBlockingInput(t *testing.T) {
	var events recorder
	manager := NewManager(events.emit)
	connection := newFakeConn()
	id := manager.Open(KindSSH, nil, dialTo(connection))
	defer manager.Close(id)
	if err := manager.Resize(id, 80, 24); err != nil {
		t.Fatal(err)
	}
	events.waitState(t, id, StateConnected)

	if err := manager.Pause(id); err != nil {
		t.Fatal(err)
	}
	if err := manager.Pause(id); err != nil {
		t.Fatalf("Pause idempotente: %v", err)
	}
	written := make(chan error, 1)
	go func() {
		_, err := connection.pw.Write([]byte("saída pausada"))
		written <- err
	}()
	time.Sleep(3 * FlushDelay)
	if got := dataForSession(events.snapshot(), id); got != "" {
		t.Fatalf("saída durante pausa = %q", got)
	}

	if err := manager.Write(id, "entrada continua"); err != nil {
		t.Fatal(err)
	}
	connection.mu.Lock()
	input := string(connection.written)
	connection.mu.Unlock()
	if input != "entrada continua" {
		t.Fatalf("entrada durante pausa = %q", input)
	}

	if err := manager.Resume(id); err != nil {
		t.Fatal(err)
	}
	if err := manager.Resume(id); err != nil {
		t.Fatalf("Resume idempotente: %v", err)
	}
	select {
	case err := <-written:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("leitor não retomou")
	}
	waitFor(t, func() bool { return dataForSession(events.snapshot(), id) == "saída pausada" })
}

func TestPauseExpiresAndMissingSessionIsIdempotent(t *testing.T) {
	var events recorder
	manager := NewManager(events.emit)
	manager.pauseTimeout = 40 * time.Millisecond
	connection := newFakeConn()
	id := manager.Open(KindSSH, nil, dialTo(connection))
	defer manager.Close(id)
	if err := manager.Resize(id, 80, 24); err != nil {
		t.Fatal(err)
	}
	events.waitState(t, id, StateConnected)

	if err := manager.Pause(id); err != nil {
		t.Fatal(err)
	}
	go func() { _, _ = connection.pw.Write([]byte("expirou")) }()
	waitFor(t, func() bool { return dataForSession(events.snapshot(), id) == "expirou" })

	missing := newID()
	if err := manager.Pause(missing); err != nil {
		t.Fatalf("Pause de sessão inexistente = %v", err)
	}
	if err := manager.Resume(missing); err != nil {
		t.Fatalf("Resume de sessão inexistente = %v", err)
	}
}

func TestCloseReleasesPausedReader(t *testing.T) {
	var events recorder
	manager := NewManager(events.emit)
	connection := newFakeConn()
	id := manager.Open(KindSSH, nil, dialTo(connection))
	if err := manager.Resize(id, 80, 24); err != nil {
		t.Fatal(err)
	}
	events.waitState(t, id, StateConnected)
	if err := manager.Pause(id); err != nil {
		t.Fatal(err)
	}
	go func() { _, _ = connection.pw.Write([]byte("bloqueada")) }()

	done := make(chan error, 1)
	go func() { done <- manager.Close(id) }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("Close não liberou o leitor pausado")
	}
}

func dataForSession(events []event, id string) string {
	var result string
	for _, item := range events {
		if data, ok := item.payload.(DataEvent); ok && data.SessionID == id {
			result += data.Data
		}
	}
	return result
}

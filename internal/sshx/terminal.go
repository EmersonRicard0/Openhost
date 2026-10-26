package sshx

import (
	"context"
	"io"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// Terminal é o shell remoto de uma sessão (implementa session.Conn).
type Terminal struct {
	client *Client

	mu           sync.Mutex
	sess         *ssh.Session
	stdin        io.WriteCloser
	sniffer      *vendorSniffer
	snifferReady chan struct{}
	readyOnce    sync.Once
}

func NewTerminal(c *Client) *Terminal {
	return &Terminal{client: c, snifferReady: make(chan struct{})}
}

// Latency expõe à sessão o RTT medido pelo keepalive para a barra de status.
func (t *Terminal) Latency() time.Duration {
	return t.client.Latency()
}

// Start pede o PTY já com o tamanho do primeiro fit e abre o shell.
func (t *Terminal) Start(cols, rows int, out io.Writer) error {
	sess, err := t.client.NewSession()
	if err != nil {
		return err
	}
	stdin, err := sess.StdinPipe()
	if err != nil {
		_ = sess.Close()
		return err
	}
	sniffer := newVendorSniffer(out, 5*time.Second)
	sess.Stdout, sess.Stderr = sniffer, sniffer
	modes := ssh.TerminalModes{ssh.ECHO: 1, ssh.TTY_OP_ISPEED: 14400, ssh.TTY_OP_OSPEED: 14400}
	if err := sess.RequestPty(t.client.term, rows, cols, modes); err != nil {
		_ = sess.Close()
		return err
	}
	if err := sess.Shell(); err != nil {
		_ = sess.Close()
		return err
	}
	t.mu.Lock()
	t.sess, t.stdin, t.sniffer = sess, stdin, sniffer
	t.mu.Unlock()
	t.readyOnce.Do(func() { close(t.snifferReady) })
	return nil
}

// InitialOutput devolve uma única cópia do trecho observado e o descarta em seguida.
func (t *Terminal) InitialOutput(ctx context.Context) []byte {
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-t.snifferReady:
	case <-t.client.stop:
		return nil
	case <-ctx.Done():
		return nil
	}
	t.mu.Lock()
	sniffer := t.sniffer
	t.mu.Unlock()
	if sniffer == nil {
		return nil
	}
	return sniffer.InitialOutput(ctx)
}

// Wait espera o shell terminar ou a conexão cair; toda a saída já foi entregue ao voltar.
func (t *Terminal) Wait() error {
	t.mu.Lock()
	sess := t.sess
	t.mu.Unlock()
	if sess != nil {
		_ = sess.Wait()
	}
	t.closeSniffer()
	return nil
}

func (t *Terminal) Write(p []byte) error {
	t.mu.Lock()
	stdin := t.stdin
	t.mu.Unlock()
	if stdin == nil {
		return nil
	}
	_, err := stdin.Write(p)
	return err
}

func (t *Terminal) Resize(cols, rows int) error {
	t.mu.Lock()
	sess := t.sess
	t.mu.Unlock()
	if sess == nil {
		return nil
	}
	return sess.WindowChange(rows, cols)
}

func (t *Terminal) Close() error {
	t.mu.Lock()
	sess := t.sess
	t.mu.Unlock()
	if sess != nil {
		_ = sess.Close()
	}
	t.closeSniffer()
	return t.client.Close()
}

func (t *Terminal) closeSniffer() {
	t.mu.Lock()
	sniffer := t.sniffer
	t.mu.Unlock()
	if sniffer != nil {
		sniffer.Close()
	}
}

type vendorSniffer struct {
	out io.Writer

	mu        sync.Mutex
	buffer    []byte
	closed    bool
	delivered bool
	done      chan struct{}
	doneOnce  sync.Once
	timer     *time.Timer
}

func newVendorSniffer(out io.Writer, window time.Duration) *vendorSniffer {
	s := &vendorSniffer{out: out, done: make(chan struct{})}
	s.timer = time.AfterFunc(window, s.Close)
	return s
}

func (s *vendorSniffer) Write(p []byte) (int, error) {
	n, err := s.out.Write(p)
	shouldClose := false
	s.mu.Lock()
	if !s.closed && n > 0 {
		remaining := maxVendorTextBytes - len(s.buffer)
		if remaining > n {
			remaining = n
		}
		if remaining > 0 {
			s.buffer = append(s.buffer, p[:remaining]...)
		}
		shouldClose = len(s.buffer) == maxVendorTextBytes
	}
	s.mu.Unlock()
	if shouldClose {
		s.Close()
	}
	return n, err
}

func (s *vendorSniffer) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	s.mu.Unlock()
	if s.timer != nil {
		s.timer.Stop()
	}
	s.doneOnce.Do(func() { close(s.done) })
}

func (s *vendorSniffer) InitialOutput(ctx context.Context) []byte {
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-s.done:
	case <-ctx.Done():
		s.Close()
		<-s.done
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.delivered {
		return nil
	}
	s.delivered = true
	result := append([]byte(nil), s.buffer...)
	s.buffer = nil
	return result
}

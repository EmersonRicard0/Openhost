//go:build !windows

package sshx

import (
	"crypto/ed25519"
	"crypto/rand"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

// Agente em memória num socket Unix em SSH_AUTH_SOCK (specs/004-linux-macos, T017).
func TestUnixAgentSocketAuthenticates(t *testing.T) {
	_, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("SSH_AUTH_SOCK", serveUnixAgent(t, privateKey))

	server := startServer(t, func(s *server) { s.authorized = signer.PublicKey() })
	client, err := dial(t, opts(server, newKnown(), Auth{Method: model.AuthAgent}), &fakeIx{acceptKey: true})
	if err != nil {
		t.Fatalf("Dial() com o agente do SSH_AUTH_SOCK: %v", err)
	}
	if err := client.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestEmptySSHAuthSockIsAgentUnavailable(t *testing.T) {
	t.Setenv("SSH_AUTH_SOCK", "")
	server := startServer(t, nil)
	_, err := dial(t, opts(server, newKnown(), Auth{Method: model.AuthAgent}), &fakeIx{acceptKey: true})
	wantCode(t, err, apperr.AgentUnavailable)
}

func TestMissingAgentSocketHidesPath(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "agente-que-nao-existe.sock")
	t.Setenv("SSH_AUTH_SOCK", missing)
	server := startServer(t, nil)
	_, err := dial(t, opts(server, newKnown(), Auth{Method: model.AuthAgent}), &fakeIx{acceptKey: true})
	wantCode(t, err, apperr.AgentUnavailable)
	if strings.Contains(err.Error(), "agente-que-nao-existe") {
		t.Fatalf("o erro expõe o caminho do socket: %v", err)
	}
}

func serveUnixAgent(t *testing.T, privateKey any) string {
	t.Helper()
	// Caminho curto: sockets Unix têm limite de ~104 bytes no macOS, e o TempDir de lá é longo.
	dir, err := os.MkdirTemp("", "sva")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	sock := filepath.Join(dir, "a.sock")
	listener, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	keyring := agent.NewKeyring()
	if err := keyring.Add(agent.AddedKey{PrivateKey: privateKey, Comment: "keyuser"}); err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func() {
				defer conn.Close()
				_ = agent.ServeAgent(keyring, conn)
			}()
		}
	}()
	return sock
}

package importer

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"shellvault/internal/model"
)

// SC-302: prévia de 1.000 hosts em até 3 s e gravação em até 5 s.
const (
	previewBudget = 3 * time.Second
	commitBudget  = 5 * time.Second
	perfHosts     = 1000
)

func TestPerfCSVPreviewAndCommit(t *testing.T) {
	var b strings.Builder
	b.WriteString("nome;endereco;porta;usuario;grupo\n")
	for i := 0; i < perfHosts; i++ {
		fmt.Fprintf(&b, "host-%04d;10.%d.%d.1;22;admin;Clientes/Regiao-%02d/OLTs\n", i, i/250, i%250, i%40)
	}
	path := filepath.Join(t.TempDir(), "mil.csv")
	if err := os.WriteFile(path, []byte(b.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	measurePreviewAndCommit(t, func(content *model.Content) (*ImportPreview, error) {
		return LoadCSV(path, nil, content)
	})
}

func TestPerfOpenSSHPreviewAndCommit(t *testing.T) {
	var b strings.Builder
	b.WriteString("Host *\n  User admin\n\n")
	for i := 0; i < perfHosts; i++ {
		fmt.Fprintf(&b, "Host host-%04d\n  HostName 10.%d.%d.1\n  Port %d\n\n", i, i/250, i%250, 22+i%3)
	}
	home := t.TempDir()
	path := filepath.Join(home, "config")
	if err := os.WriteFile(path, []byte(b.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	measurePreviewAndCommit(t, func(content *model.Content) (*ImportPreview, error) {
		return LoadOpenSSH(path, OpenSSHOptions{HomeDir: home, LocalUser: "local"}, content)
	})
}

// measurePreviewAndCommit importa duas vezes num cofre real: a segunda leva tudo como
// duplicado, o caso mais caro da prévia (cada linha comparada com os 1.000 hosts do cofre).
func measurePreviewAndCommit(t *testing.T, load func(*model.Content) (*ImportPreview, error)) {
	t.Helper()
	store := testStore(t)
	coordinator := NewCoordinator(store)
	for round := 1; round <= 2; round++ {
		content, err := store.Read()
		if err != nil {
			t.Fatal(err)
		}
		start := time.Now()
		p, err := load(content)
		elapsed := time.Since(start)
		if err != nil {
			t.Fatal(err)
		}
		if n := len(p.View().Rows); n != perfHosts {
			t.Fatalf("rodada %d: %d linhas", round, n)
		}
		if elapsed > previewBudget {
			t.Errorf("rodada %d: prévia levou %v (meta %v)", round, elapsed, previewBudget)
		}
		coordinator.SetPreview(p)
		start = time.Now()
		result, err := coordinator.Commit(p.ID, nil)
		elapsed = time.Since(start)
		if err != nil {
			t.Fatal(err)
		}
		if elapsed > commitBudget {
			t.Errorf("rodada %d: gravação levou %v (meta %v)", round, elapsed, commitBudget)
		}
		want := perfHosts
		if round == 2 {
			want = 0 // duplicados ficam com "Pular"
		}
		if result.Created != want {
			t.Fatalf("rodada %d: %d criados, esperava %d", round, result.Created, want)
		}
		t.Logf("rodada %d: prévia + gravação de %d hosts ok", round, perfHosts)
	}
}

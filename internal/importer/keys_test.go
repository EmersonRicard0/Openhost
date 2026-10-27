package importer

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/crypto/ssh"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
)

func TestResolveUnlockSkipAndReuseKeys(t *testing.T) {
	dir := t.TempDir()
	plain := testPrivateKey(t, nil)
	passphrase := "segredo-teste"
	protected := testPrivateKey(t, &passphrase)
	plainPath := filepath.Join(dir, "id_ed25519")
	protectedPath := filepath.Join(dir, "id_protected")
	if err := os.WriteFile(plainPath, []byte(plain), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(protectedPath, []byte(protected), 0o600); err != nil {
		t.Fatal(err)
	}

	content := model.EmptyContent()
	existing, err := domain.ImportKey(content, "existente", plain, nil, domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	protectedExisting, err := domain.ImportKey(content, "protegida existente", protected, &passphrase, domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	p, err := Build(SourceOpenSSH, "config", []CandidateRow{
		{Label: "A", Address: "a.local", Port: 22, Username: "u", KeyPath: plainPath},
		{Label: "B", Address: "b.local", Port: 22, Username: "u", KeyPath: plainPath},
		{Label: "C", Address: "c.local", Port: 22, Username: "u", KeyPath: protectedPath},
		{Label: "D", Address: "d.local", Port: 22, Username: "u", KeyPath: filepath.Join(dir, "missing")},
	}, content)
	if err != nil {
		t.Fatal(err)
	}
	if err := p.ResolveKeys(content); err != nil {
		t.Fatal(err)
	}
	view := p.View()
	if len(view.Keys) != 3 || view.Keys[0].UsedBy != 2 || view.Keys[0].Status != KeyExisting || view.Keys[0].Fingerprint == nil || *view.Keys[0].Fingerprint != existing.Fingerprint {
		t.Fatalf("chaves = %+v", view.Keys)
	}
	if view.Keys[1].Status != KeyNeedsPassphrase || view.Keys[2].Status != KeyNotFound {
		t.Fatalf("status = %+v", view.Keys)
	}
	if _, err := p.UnlockKey(view.Keys[1].Ref, "errada"); apperr.CodeOf(err) != apperr.KeyBadPassphrase {
		t.Fatalf("passphrase errada = %v", err)
	}
	unlocked, err := p.UnlockKey(view.Keys[1].Ref, passphrase)
	if err != nil || unlocked.Status != KeyExisting || unlocked.Fingerprint == nil || *unlocked.Fingerprint != protectedExisting.Fingerprint {
		t.Fatalf("desbloqueio = %+v, %v", unlocked, err)
	}
	skipped, err := p.SkipKey(view.Keys[1].Ref)
	if err != nil || skipped.Status != KeySkipped {
		t.Fatalf("skip = %+v, %v", skipped, err)
	}
	p.Zero()
	for _, key := range p.keyData {
		for _, b := range key.privateKey {
			if b != 0 {
				t.Fatal("conteúdo da chave não foi zerado")
			}
		}
		for _, b := range key.passphrase {
			if b != 0 {
				t.Fatal("passphrase não foi zerada")
			}
		}
	}
}

func TestResolveKeyRejectsOversize(t *testing.T) {
	path := filepath.Join(t.TempDir(), "large.key")
	if err := os.WriteFile(path, make([]byte, domain.MaxKeyBytes+1), 0o600); err != nil {
		t.Fatal(err)
	}
	p, _ := Build(SourceOpenSSH, "config", []CandidateRow{{Label: "A", Address: "a.local", Port: 22, Username: "u", KeyPath: path}}, model.EmptyContent())
	if err := p.ResolveKeys(model.EmptyContent()); err != nil {
		t.Fatal(err)
	}
	if got := p.View().Keys[0].Status; got != KeyUnsupported {
		t.Fatalf("status = %s", got)
	}
}

func testPrivateKey(t *testing.T, passphrase *string) string {
	t.Helper()
	_, key, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	var block *pem.Block
	if passphrase == nil {
		block, err = ssh.MarshalPrivateKey(key, "")
	} else {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(key, "", []byte(*passphrase))
	}
	if err != nil {
		t.Fatal(err)
	}
	return string(pem.EncodeToMemory(block))
}

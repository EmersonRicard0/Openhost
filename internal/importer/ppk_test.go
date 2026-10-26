package importer

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
)

const ppkTestPassphrase = "teste-123"

func ppkFixture(t *testing.T, name string) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "ppk", name))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func ppkFingerprint(t *testing.T, raw []byte, passphrase *string) string {
	t.Helper()
	converted, err := ConvertPPK(raw, passphrase)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := domain.ParsePrivateKey(string(converted), passphrase)
	if err != nil {
		t.Fatal(err)
	}
	return parsed.Fingerprint
}

func opensshFingerprint(t *testing.T, algorithm string) string {
	t.Helper()
	raw := ppkFixture(t, algorithm+".openssh")
	parsed, err := domain.ParsePrivateKey(string(raw), nil)
	if err != nil {
		t.Fatal(err)
	}
	return parsed.Fingerprint
}

func TestConvertPPKVersionsAlgorithmsAndEncryption(t *testing.T) {
	for _, algorithm := range []string{"rsa", "ed25519", "ecdsa"} {
		want := opensshFingerprint(t, algorithm)
		for _, version := range []string{"v2", "v3"} {
			for _, encryption := range []string{"none", "aes"} {
				name := strings.Join([]string{algorithm, version, encryption}, "-") + ".ppk"
				t.Run(name, func(t *testing.T) {
					var passphrase *string
					if encryption == "aes" {
						passphrase = ptr(ppkTestPassphrase)
					}
					if got := ppkFingerprint(t, ppkFixture(t, name), passphrase); got != want {
						t.Fatalf("fingerprint = %q, esperado %q", got, want)
					}
				})
			}
		}
	}
}

func TestConvertPPKRejectsWrongPassphraseAndTamperedMAC(t *testing.T) {
	for _, name := range []string{"rsa-v2-aes.ppk", "ed25519-v3-aes.ppk"} {
		t.Run(name+"/wrong", func(t *testing.T) {
			if _, err := ConvertPPK(ppkFixture(t, name), ptr("incorreta")); apperr.CodeOf(err) != apperr.KeyBadPassphrase {
				t.Fatalf("erro = %v", err)
			}
		})
	}
	for _, name := range []string{"rsa-v2-aes-bad-mac.ppk", "ed25519-v3-aes-bad-mac.ppk"} {
		t.Run(name, func(t *testing.T) {
			if _, err := ConvertPPK(ppkFixture(t, name), ptr(ppkTestPassphrase)); apperr.CodeOf(err) != apperr.KeyBadPassphrase {
				t.Fatalf("erro = %v", err)
			}
		})
	}
	if _, err := ConvertPPK(ppkFixture(t, "ed25519-v3-aes.ppk"), nil); apperr.CodeOf(err) != apperr.KeyBadPassphrase {
		t.Fatalf("sem passphrase = %v", err)
	}
}

func TestConvertPPKRejectsUnsupportedAndOversized(t *testing.T) {
	base := ppkFixture(t, "rsa-v3-none.ppk")
	unknownAlgorithm := bytes.Replace(base, []byte("ssh-rsa"), []byte("ssh-dss"), 1)
	if _, err := ConvertPPK(unknownAlgorithm, nil); apperr.CodeOf(err) != apperr.KeyUnsupported {
		t.Fatalf("algoritmo desconhecido = %v", err)
	}
	unknownCipher := bytes.Replace(base, []byte("Encryption: none"), []byte("Encryption: 3des"), 1)
	if _, err := ConvertPPK(unknownCipher, nil); apperr.CodeOf(err) != apperr.KeyUnsupported {
		t.Fatalf("cifra desconhecida = %v", err)
	}
	oversized := make([]byte, domain.MaxKeyBytes+1)
	if _, err := ConvertPPK(oversized, nil); apperr.CodeOf(err) != apperr.KeyUnsupported {
		t.Fatalf("arquivo grande = %v", err)
	}
}

func TestResolveAndUnlockPPK(t *testing.T) {
	content := model.EmptyContent()
	path := filepath.Join("testdata", "ppk", "ed25519-v3-aes.ppk")
	preview, err := Build(SourcePuTTY, "Registro do Windows (PuTTY)", []CandidateRow{{Label: "Core", Address: "core.example", Port: 22, Username: "ops", KeyPath: path}}, content)
	if err != nil {
		t.Fatal(err)
	}
	if err := preview.ResolveKeys(content); err != nil {
		t.Fatal(err)
	}
	if len(preview.Keys) != 1 || preview.Keys[0].Status != KeyNeedsPassphrase {
		t.Fatalf("chave = %+v", preview.Keys)
	}
	if _, err := preview.UnlockKey(preview.Keys[0].Ref, "incorreta"); apperr.CodeOf(err) != apperr.KeyBadPassphrase {
		t.Fatalf("passphrase errada = %v", err)
	}
	key, err := preview.UnlockKey(preview.Keys[0].Ref, ppkTestPassphrase)
	if err != nil || key.Status != KeyReady || key.Fingerprint == nil {
		t.Fatalf("UnlockKey = %+v, %v", key, err)
	}
}

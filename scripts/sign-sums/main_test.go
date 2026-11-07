package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestGenerateAndSignChecksumsBesideInput(t *testing.T) {
	dir := t.TempDir()
	keyPath := filepath.Join(dir, "update-signing.key")
	var publicOut strings.Builder
	if err := generateKey(keyPath, &publicOut, rand.Reader); err != nil {
		t.Fatal(err)
	}

	privateText, err := os.ReadFile(keyPath)
	if err != nil {
		t.Fatal(err)
	}
	privateKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(privateText)))
	if err != nil || len(privateKey) != ed25519.PrivateKeySize {
		t.Fatalf("chave privada gerada é inválida: tamanho=%d erro=%v", len(privateKey), err)
	}
	publicKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(publicOut.String()))
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		t.Fatalf("chave pública impressa é inválida: tamanho=%d erro=%v", len(publicKey), err)
	}
	if info, err := os.Stat(keyPath); err != nil {
		t.Fatal(err)
	} else if runtime.GOOS != "windows" && info.Mode().Perm()&0o077 != 0 {
		t.Fatalf("permissão da chave privada = %04o, esperada 0600", info.Mode().Perm())
	}

	sumsPath := filepath.Join(dir, "SHA256SUMS.txt")
	sums := []byte("0123456789abcdef  OpenHost-0.6.0-windows-amd64-installer.exe\n")
	if err := os.WriteFile(sumsPath, sums, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := signChecksums(sumsPath, strings.TrimSpace(string(privateText))); err != nil {
		t.Fatal(err)
	}

	signatureText, err := os.ReadFile(sumsPath + ".sig")
	if err != nil {
		t.Fatalf("assinatura não foi gravada ao lado do SHA256SUMS.txt: %v", err)
	}
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(signatureText)))
	if err != nil {
		t.Fatal(err)
	}
	if !ed25519.Verify(ed25519.PublicKey(publicKey), sums, signature) {
		t.Fatal("assinatura gerada não confere")
	}
}

func TestSignChecksumsRejectsInvalidPrivateKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "SHA256SUMS.txt")
	if err := os.WriteFile(path, []byte("checksums"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := signChecksums(path, base64.StdEncoding.EncodeToString([]byte("curta"))); err == nil {
		t.Fatal("chave privada curta foi aceita")
	}
	if _, err := os.Stat(path + ".sig"); !os.IsNotExist(err) {
		t.Fatalf("assinatura foi criada após erro: %v", err)
	}
}

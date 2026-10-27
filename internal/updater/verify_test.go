package updater

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestVerifySignatureAndChecksum(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	packageBytes := []byte("pacote autêntico")
	digest := sha256.Sum256(packageBytes)
	name := "OpenHost-0.6.0-windows-amd64-installer.exe"
	sums := []byte(fmt.Sprintf("%s  %s\n", hex.EncodeToString(digest[:]), name))
	signature := []byte(base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, sums)))

	if err := Verify(sums, signature, publicKey, name, bytes.NewReader(packageBytes)); err != nil {
		t.Fatal(err)
	}
	badSignature := append([]byte(nil), signature...)
	badSignature[0] = 'A'
	if err := Verify(sums, badSignature, publicKey, name, bytes.NewReader(packageBytes)); !errors.Is(err, ErrSignature) {
		t.Fatalf("assinatura inválida: %v", err)
	}
	if err := Verify(sums, signature, publicKey, name, strings.NewReader("alterado")); !errors.Is(err, ErrChecksum) {
		t.Fatalf("checksum inválido: %v", err)
	}
	if err := Verify(sums, signature, publicKey, "outro.exe", bytes.NewReader(packageBytes)); !errors.Is(err, ErrChecksum) {
		t.Fatalf("nome ausente: %v", err)
	}
}

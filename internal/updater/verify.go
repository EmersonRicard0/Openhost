package updater

import (
	"bufio"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"strings"
)

var (
	ErrSignature = errors.New("signature")
	ErrChecksum  = errors.New("checksum")
)

func Verify(sums, signatureText []byte, publicKey ed25519.PublicKey, name string, file io.Reader) error {
	if len(publicKey) != ed25519.PublicKeySize {
		return ErrSignature
	}
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(signatureText)))
	if err != nil || len(signature) != ed25519.SignatureSize || !ed25519.Verify(publicKey, sums, signature) {
		return ErrSignature
	}
	if filepath.Base(name) != name || name == "." || name == "" {
		return ErrChecksum
	}
	want, found := checksumFor(sums, name)
	if !found {
		return ErrChecksum
	}
	digest := sha256.New()
	if _, err := io.Copy(digest, file); err != nil {
		return fmt.Errorf("checksum: %w", err)
	}
	if subtle.ConstantTimeCompare(want, digest.Sum(nil)) != 1 {
		return ErrChecksum
	}
	return nil
}

func checksumFor(sums []byte, name string) ([]byte, bool) {
	scanner := bufio.NewScanner(strings.NewReader(string(sums)))
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) != 2 || strings.TrimPrefix(fields[1], "*") != name {
			continue
		}
		digest, err := hex.DecodeString(fields[0])
		if err != nil || len(digest) != sha256.Size {
			return nil, false
		}
		return digest, true
	}
	return nil, false
}

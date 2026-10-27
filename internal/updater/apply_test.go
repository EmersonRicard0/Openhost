package updater

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestLoadApplyManifestRejectsOutsideUpdates(t *testing.T) {
	dataDir := t.TempDir()
	outside := filepath.Join(t.TempDir(), "apply.json")
	if err := os.WriteFile(outside, []byte(`{}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadApplyManifest(dataDir, outside); !errors.Is(err, ErrUnsafeManifest) {
		t.Fatalf("manifesto fora de updates = %v", err)
	}
}

func TestApplyUpdateReverifiesAndStoresOneShotResult(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	dataDir := t.TempDir()
	versionDir := filepath.Join(dataDir, "updates", "0.6.0")
	if err := os.MkdirAll(versionDir, 0o700); err != nil {
		t.Fatal(err)
	}
	name := "OpenHost-0.6.0-windows-amd64-installer.exe"
	packageData := []byte("pacote verificado de novo")
	packagePath := filepath.Join(versionDir, name)
	if err := os.WriteFile(packagePath, packageData, 0o600); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(packageData)
	sums := []byte(fmt.Sprintf("%s  %s\n", hex.EncodeToString(digest[:]), name))
	if err := os.WriteFile(filepath.Join(versionDir, "SHA256SUMS.txt"), sums, 0o600); err != nil {
		t.Fatal(err)
	}
	sig := base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, sums))
	if err := os.WriteFile(filepath.Join(versionDir, "SHA256SUMS.txt.sig"), []byte(sig), 0o600); err != nil {
		t.Fatal(err)
	}
	targetPath := filepath.Join(t.TempDir(), "OpenHost.exe")
	if err := os.WriteFile(targetPath, []byte("versão anterior"), 0o700); err != nil {
		t.Fatal(err)
	}
	manifest := ApplyManifest{PID: 123, Version: "0.6.0", Install: InstallNSIS, PackagePath: packagePath,
		TargetPath: targetPath, Relaunch: []string{targetPath}}
	manifestData, _ := json.Marshal(manifest)
	manifestPath := filepath.Join(versionDir, "apply.json")
	if err := os.WriteFile(manifestPath, manifestData, 0o600); err != nil {
		t.Fatal(err)
	}

	var waited int
	var applied bool
	err = applyUpdate(dataDir, manifestPath, applyOptions{
		publicKey: publicKey,
		wait:      func(pid int) error { waited = pid; return nil },
		apply: func(got ApplyManifest) error {
			applied = true
			if got.PackagePath != packagePath {
				t.Fatalf("pacote = %q", got.PackagePath)
			}
			return nil
		},
		relaunch: func([]string) error { return nil },
	})
	if err != nil || waited != 123 || !applied {
		t.Fatalf("apply = waited %d applied %v err %v", waited, applied, err)
	}
	result, err := ConsumeLastResult(dataDir)
	if err != nil || result == nil || result.Status != "ok" || result.Version != "0.6.0" {
		t.Fatalf("resultado = %+v, %v", result, err)
	}
	if again, err := ConsumeLastResult(dataDir); err != nil || again != nil {
		t.Fatalf("resultado não foi consumido: %+v, %v", again, err)
	}

	// Adultera depois do download: a segunda verificação deve impedir apply.
	if err := os.WriteFile(packagePath, []byte("adulterado"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, manifestData, 0o600); err != nil {
		t.Fatal(err)
	}
	applied = false
	err = applyUpdate(dataDir, manifestPath, applyOptions{
		publicKey: publicKey,
		wait:      func(int) error { return nil },
		apply:     func(ApplyManifest) error { applied = true; return nil },
		relaunch:  func([]string) error { return nil },
	})
	if !errors.Is(err, ErrChecksum) || applied {
		t.Fatalf("pacote adulterado = applied %v err %v", applied, err)
	}
	result, err = ConsumeLastResult(dataDir)
	if err != nil || result == nil || result.Status != "failed" || result.Reason != "checksum" {
		t.Fatalf("resultado da falha = %+v, %v", result, err)
	}
}

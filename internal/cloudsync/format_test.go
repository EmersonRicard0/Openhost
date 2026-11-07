package cloudsync

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/vault"
)

func TestKeyringRoundTripAndFutureFormat(t *testing.T) {
	params := vault.TestKDF(bytes.Repeat([]byte{0x22}, vault.SaltSize))
	keys := map[int][]byte{1: bytes.Repeat([]byte{0x11}, vault.KeySize), 2: bytes.Repeat([]byte{0x33}, vault.KeySize)}
	encoded, err := SealKeyring("senha-do-chaveiro", params, 2, keys)
	if err != nil {
		t.Fatal(err)
	}
	opened, metadata, err := OpenKeyring("senha-do-chaveiro", encoded)
	if err != nil || metadata.Epoch != 2 || !bytes.Equal(opened[1], keys[1]) || !bytes.Equal(opened[2], keys[2]) {
		t.Fatalf("keyring = %+v, %+v, %v", opened, metadata, err)
	}
	if _, _, err := OpenKeyring("senha-errada", encoded); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha errada = %v", err)
	}
	var raw map[string]any
	if err := json.Unmarshal(encoded, &raw); err != nil {
		t.Fatal(err)
	}
	raw["format"] = float64(2)
	future, _ := json.Marshal(raw)
	if _, _, err := OpenKeyring("senha-do-chaveiro", future); apperr.CodeOf(err) != apperr.SyncFormat {
		t.Fatalf("formato futuro = %v", err)
	}
}

func TestSnapshotRoundTripContainsNoPlaintext(t *testing.T) {
	dek := bytes.Repeat([]byte{0x44}, vault.KeySize)
	body := SnapshotBody{DeviceName: "Notebook NOC", CreatedAt: "2026-10-27T12:00:00Z", Items: []ItemVersion{{
		Key: "host:11111111-2222-4333-8444-555555555555", VV: VersionVector{"aabbccddeeff0011": 1},
		Data: json.RawMessage(`{"label":"Rótulo ultrassecreto","address":"10.99.88.77","username":"usuario-secreto","password":"senha-super-secreta"}`),
	}}}
	encoded, err := SealSnapshot(3, 42, "aabbccddeeff0011", dek, body)
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range []string{"Notebook NOC", "Rótulo ultrassecreto", "10.99.88.77", "usuario-secreto", "senha-super-secreta"} {
		if bytes.Contains(encoded, []byte(secret)) {
			t.Fatalf("snapshot contém %q em claro", secret)
		}
	}
	header, opened, err := OpenSnapshot(encoded, map[int][]byte{3: dek})
	if err != nil || header.Lamport != 42 || opened.DeviceName != body.DeviceName || len(opened.Items) != 1 {
		t.Fatalf("snapshot = %+v, %+v, %v", header, opened, err)
	}
}

func TestSnapshotRejectsBadADHashAndFutureFormat(t *testing.T) {
	dek := bytes.Repeat([]byte{0x55}, vault.KeySize)
	body := SnapshotBody{DeviceName: "PC", CreatedAt: "2026-10-27T12:00:00Z", Items: []ItemVersion{}}
	encoded, err := SealSnapshot(1, 1, "aabbccddeeff0011", dek, body)
	if err != nil {
		t.Fatal(err)
	}
	headerSize := int(binary.BigEndian.Uint32(encoded[4:8]))
	headerBytes := append([]byte(nil), encoded[8:8+headerSize]...)
	var header SnapshotHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		t.Fatal(err)
	}

	// Mudar um byte autenticado do cabeçalho invalida o AD.
	badAD := append([]byte(nil), encoded...)
	badAD[8+bytes.Index(headerBytes, []byte(`"lamport":1`))+len(`"lamport":`)] = '2'
	if _, _, err := OpenSnapshot(badAD, map[int][]byte{1: dek}); apperr.CodeOf(err) != apperr.CloudCorrupt {
		t.Fatalf("AD adulterado = %v", err)
	}

	// Corpo válido e autenticado, mas hash declarado diferente.
	var compressed bytes.Buffer
	zipper := gzip.NewWriter(&compressed)
	plain, _ := json.Marshal(body)
	_, _ = zipper.Write(plain)
	_ = zipper.Close()
	header.ContentHash = hex.EncodeToString(sha256.New().Sum(nil))
	badHeader, _ := json.Marshal(header)
	sealed, _ := vault.Seal(dek, compressed.Bytes(), badHeader)
	badHash := append([]byte("OHS1"), make([]byte, 4)...)
	binary.BigEndian.PutUint32(badHash[4:8], uint32(len(badHeader)))
	badHash = append(badHash, badHeader...)
	badHash = append(badHash, sealed...)
	if _, _, err := OpenSnapshot(badHash, map[int][]byte{1: dek}); apperr.CodeOf(err) != apperr.CloudCorrupt {
		t.Fatalf("hash adulterado = %v", err)
	}

	header.Format = 2
	futureHeader, _ := json.Marshal(header)
	future := append([]byte("OHS1"), make([]byte, 4)...)
	binary.BigEndian.PutUint32(future[4:8], uint32(len(futureHeader)))
	future = append(future, futureHeader...)
	future = append(future, encoded[8+headerSize:]...)
	if _, _, err := OpenSnapshot(future, map[int][]byte{1: dek}); apperr.CodeOf(err) != apperr.SyncFormat {
		t.Fatalf("formato futuro = %v", err)
	}
}

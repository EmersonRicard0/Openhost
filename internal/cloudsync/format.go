package cloudsync

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"shellvault/internal/apperr"
	"shellvault/internal/vault"
)

const (
	cloudFormat       = 1
	maxKeyringSize    = 1 << 20
	maxSnapshotHeader = 64 << 10
	maxSnapshotBody   = 64 << 20
)

var ErrMissingEpoch = errors.New("snapshot key epoch unavailable")

type KeyringKDF struct {
	Alg       string `json:"alg"`
	Time      uint32 `json:"time"`
	MemoryKiB uint32 `json:"memoryKiB"`
	Salt      []byte `json:"salt"`
}

type Keyring struct {
	Format     int        `json:"format"`
	Epoch      int        `json:"epoch"`
	KDF        KeyringKDF `json:"kdf"`
	SealedKeys string     `json:"sealedKeys"`
}

func SealKeyring(password string, params vault.KDFParams, epoch int, keys map[int][]byte) ([]byte, error) {
	kek := vault.DeriveKEK([]byte(password), params)
	defer vault.Zero(kek)
	return SealKeyringWithKEK(kek, params, epoch, keys)
}

func SealKeyringWithKEK(kek []byte, params vault.KDFParams, epoch int, keys map[int][]byte) ([]byte, error) {
	if !validKDF(params) || epoch < 1 || len(keys) == 0 {
		return nil, apperr.New(apperr.InvalidInput)
	}
	if len(kek) != vault.KeySize {
		return nil, apperr.New(apperr.InvalidInput)
	}
	encodedKeys := make(map[string]string, len(keys))
	for number, key := range keys {
		if number < 1 || number > epoch || len(key) != vault.KeySize {
			return nil, apperr.New(apperr.InvalidInput)
		}
		encodedKeys[strconv.Itoa(number)] = base64.StdEncoding.EncodeToString(key)
	}
	if _, found := encodedKeys[strconv.Itoa(epoch)]; !found {
		return nil, apperr.New(apperr.InvalidInput)
	}
	plain, err := json.Marshal(encodedKeys)
	if err != nil {
		return nil, err
	}
	defer vault.Zero(plain)
	sealed, err := vault.Seal(kek, plain, keyringAD(epoch))
	if err != nil {
		return nil, err
	}
	keyring := Keyring{Format: cloudFormat, Epoch: epoch,
		KDF:        KeyringKDF{Alg: "argon2id", Time: params.Time, MemoryKiB: params.MemoryKiB, Salt: append([]byte(nil), params.Salt...)},
		SealedKeys: base64.StdEncoding.EncodeToString(sealed)}
	return json.Marshal(keyring)
}

func OpenKeyring(password string, data []byte) (map[int][]byte, Keyring, error) {
	var keyring Keyring
	if len(data) == 0 || len(data) > maxKeyringSize || decodeStrict(data, &keyring) != nil {
		return nil, Keyring{}, apperr.New(apperr.CloudCorrupt)
	}
	if keyring.Format > cloudFormat {
		return nil, keyring, apperr.New(apperr.SyncFormat)
	}
	params := vault.KDFParams{Time: keyring.KDF.Time, MemoryKiB: keyring.KDF.MemoryKiB, Salt: keyring.KDF.Salt}
	if keyring.Format != cloudFormat || keyring.Epoch < 1 || keyring.KDF.Alg != "argon2id" || !validKDF(params) {
		return nil, keyring, apperr.New(apperr.CloudCorrupt)
	}
	sealed, err := base64.StdEncoding.DecodeString(keyring.SealedKeys)
	if err != nil {
		return nil, keyring, apperr.New(apperr.CloudCorrupt)
	}
	kek := vault.DeriveKEK([]byte(password), params)
	defer vault.Zero(kek)
	plain, err := vault.Unseal(kek, sealed, keyringAD(keyring.Epoch))
	if err != nil {
		return nil, keyring, apperr.New(apperr.VaultBadPassword)
	}
	defer vault.Zero(plain)
	var encoded map[string]string
	if decodeStrict(plain, &encoded) != nil || len(encoded) == 0 {
		return nil, keyring, apperr.New(apperr.CloudCorrupt)
	}
	keys := make(map[int][]byte, len(encoded))
	for rawEpoch, rawKey := range encoded {
		epoch, err := strconv.Atoi(rawEpoch)
		if err != nil || epoch < 1 || epoch > keyring.Epoch {
			zeroKeys(keys)
			return nil, keyring, apperr.New(apperr.CloudCorrupt)
		}
		key, err := base64.StdEncoding.DecodeString(rawKey)
		if err != nil || len(key) != vault.KeySize {
			vault.Zero(key)
			zeroKeys(keys)
			return nil, keyring, apperr.New(apperr.CloudCorrupt)
		}
		keys[epoch] = key
	}
	if _, found := keys[keyring.Epoch]; !found {
		zeroKeys(keys)
		return nil, keyring, apperr.New(apperr.CloudCorrupt)
	}
	return keys, keyring, nil
}

func validKDF(params vault.KDFParams) bool {
	return params.Time >= 1 && params.Time <= 10 && params.MemoryKiB >= 8 && params.MemoryKiB <= 512*1024 && len(params.Salt) == vault.SaltSize
}

func keyringAD(epoch int) []byte { return fmt.Appendf(nil, "keyring:%d", epoch) }

func zeroKeys(keys map[int][]byte) {
	for _, key := range keys {
		vault.Zero(key)
	}
}

type VersionVector map[string]uint64

type ItemVersion struct {
	Key       string          `json:"key"`
	VV        VersionVector   `json:"vv"`
	Deleted   bool            `json:"deleted"`
	DeletedAt string          `json:"deletedAt,omitempty"`
	Data      json.RawMessage `json:"data,omitempty"`
}

type SnapshotBody struct {
	DeviceName string        `json:"deviceName"`
	CreatedAt  string        `json:"createdAt"`
	Items      []ItemVersion `json:"items"`
}

type SnapshotHeader struct {
	Format      int    `json:"format"`
	Epoch       int    `json:"epoch"`
	Lamport     uint64 `json:"lamport"`
	DeviceID    string `json:"deviceId"`
	ContentHash string `json:"contentHash"`
}

var deviceIDPattern = regexp.MustCompile(`^[0-9a-f]{16}$`)

func SealSnapshot(epoch int, lamport uint64, deviceID string, dek []byte, body SnapshotBody) ([]byte, error) {
	if epoch < 1 || lamport < 1 || !deviceIDPattern.MatchString(deviceID) || len(dek) != vault.KeySize || !validSnapshotBody(body) {
		return nil, apperr.New(apperr.InvalidInput)
	}
	plain, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	defer vault.Zero(plain)
	digest := sha256.Sum256(plain)
	header := SnapshotHeader{Format: cloudFormat, Epoch: epoch, Lamport: lamport, DeviceID: deviceID, ContentHash: hex.EncodeToString(digest[:])}
	headerBytes, err := json.Marshal(header)
	if err != nil {
		return nil, err
	}
	var compressed bytes.Buffer
	zipper, err := gzip.NewWriterLevel(&compressed, gzip.BestSpeed)
	if err != nil {
		return nil, err
	}
	zipper.Header.ModTime = time.Time{}
	if _, err := zipper.Write(plain); err != nil {
		_ = zipper.Close()
		return nil, err
	}
	if err := zipper.Close(); err != nil {
		return nil, err
	}
	sealed, err := vault.Seal(dek, compressed.Bytes(), headerBytes)
	if err != nil {
		return nil, err
	}
	result := make([]byte, 8, 8+len(headerBytes)+len(sealed))
	copy(result, "OHS1")
	binary.BigEndian.PutUint32(result[4:8], uint32(len(headerBytes)))
	result = append(result, headerBytes...)
	result = append(result, sealed...)
	return result, nil
}

func OpenSnapshot(data []byte, keys map[int][]byte) (SnapshotHeader, SnapshotBody, error) {
	if len(data) < 8 || !bytes.Equal(data[:4], []byte("OHS1")) {
		return SnapshotHeader{}, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	headerLength := int(binary.BigEndian.Uint32(data[4:8]))
	if headerLength < 2 || headerLength > maxSnapshotHeader || 8+headerLength >= len(data) {
		return SnapshotHeader{}, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	headerBytes := data[8 : 8+headerLength]
	var header SnapshotHeader
	if decodeStrict(headerBytes, &header) != nil {
		return SnapshotHeader{}, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	if header.Format > cloudFormat {
		return header, SnapshotBody{}, apperr.New(apperr.SyncFormat)
	}
	if header.Format != cloudFormat || header.Epoch < 1 || header.Lamport < 1 || !deviceIDPattern.MatchString(header.DeviceID) || len(header.ContentHash) != sha256.Size*2 {
		return header, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	if _, err := hex.DecodeString(header.ContentHash); err != nil {
		return header, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	key := keys[header.Epoch]
	if len(key) != vault.KeySize {
		return header, SnapshotBody{}, ErrMissingEpoch
	}
	compressed, err := vault.Unseal(key, data[8+headerLength:], headerBytes)
	if err != nil {
		return header, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	defer vault.Zero(compressed)
	reader, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return header, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	plain, readErr := io.ReadAll(io.LimitReader(reader, maxSnapshotBody+1))
	closeErr := reader.Close()
	if readErr != nil || closeErr != nil || len(plain) > maxSnapshotBody {
		vault.Zero(plain)
		return header, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	defer vault.Zero(plain)
	digest := sha256.Sum256(plain)
	if !strings.EqualFold(header.ContentHash, hex.EncodeToString(digest[:])) {
		return header, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	var body SnapshotBody
	if decodeStrict(plain, &body) != nil || !validSnapshotBody(body) {
		return header, SnapshotBody{}, apperr.New(apperr.CloudCorrupt)
	}
	return header, body, nil
}

func validSnapshotBody(body SnapshotBody) bool {
	if !validDeviceName(body.DeviceName) {
		return false
	}
	if _, err := time.Parse(time.RFC3339Nano, body.CreatedAt); err != nil {
		return false
	}
	seen := make(map[string]struct{}, len(body.Items))
	for _, item := range body.Items {
		if item.Key == "" || len(item.Key) > 512 || strings.IndexByte(item.Key, ':') < 1 || containsControl(item.Key) {
			return false
		}
		if _, duplicate := seen[item.Key]; duplicate {
			return false
		}
		seen[item.Key] = struct{}{}
		if len(item.VV) == 0 {
			return false
		}
		for device, counter := range item.VV {
			if !deviceIDPattern.MatchString(device) || counter == 0 {
				return false
			}
		}
		if item.Deleted {
			if len(item.Data) != 0 {
				return false
			}
			if _, err := time.Parse(time.RFC3339Nano, item.DeletedAt); err != nil {
				return false
			}
		} else if len(item.Data) == 0 || !json.Valid(item.Data) {
			return false
		}
	}
	return true
}

func validDeviceName(name string) bool {
	count := utf8.RuneCountInString(name)
	return count >= 1 && count <= 64 && !containsControl(name)
}

func containsControl(value string) bool {
	return strings.IndexFunc(value, unicode.IsControl) >= 0
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("trailing JSON data")
	}
	return nil
}

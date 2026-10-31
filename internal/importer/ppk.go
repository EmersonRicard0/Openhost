package importer

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/pem"
	"math/big"
	"strconv"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/ssh"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
)

const (
	ppkV2Prefix       = "PuTTY-User-Key-File-2: "
	ppkV3Prefix       = "PuTTY-User-Key-File-3: "
	ppkMACKeyPrefix   = "putty-private-key-file-mac-key"
	maxPPKArgonMemory = 256 * 1024
	maxPPKArgonPasses = 100
	maxPPKArgonLanes  = 16
)

type ppkFile struct {
	version    int
	algorithm  string
	encryption string
	comment    string
	public     []byte
	private    []byte
	mac        []byte
	kdf        string
	memory     uint32
	passes     uint32
	parallel   uint8
	salt       []byte
}

// ConvertPPK verifies a PuTTY private-key file and returns the same key in the
// OpenSSH private-key container understood by the rest of the application.
func ConvertPPK(raw []byte, passphrase *string) ([]byte, error) {
	if len(raw) == 0 || len(raw) > domain.MaxKeyBytes {
		return nil, apperr.New(apperr.KeyUnsupported)
	}
	file, err := parsePPK(raw)
	if err != nil {
		return nil, apperr.New(apperr.KeyUnsupported)
	}
	plain := append([]byte(nil), file.private...)
	defer zero(plain)

	var macKey []byte
	if file.version == 2 {
		phrase := []byte(nil)
		if passphrase != nil {
			phrase = []byte(*passphrase)
		}
		if file.encryption == "aes256-cbc" {
			if passphrase == nil {
				return nil, apperr.New(apperr.KeyBadPassphrase)
			}
			key := ppkV2EncryptionKey(phrase)
			if !decryptPPK(plain, key, make([]byte, aes.BlockSize)) {
				zero(key)
				return nil, apperr.New(apperr.KeyBadPassphrase)
			}
			zero(key)
		}
		sum := sha1.Sum(append([]byte(ppkMACKeyPrefix), phrase...))
		macKey = append([]byte(nil), sum[:]...)
	} else if file.encryption == "aes256-cbc" {
		if passphrase == nil {
			return nil, apperr.New(apperr.KeyBadPassphrase)
		}
		derived, ok := ppkV3Keys([]byte(*passphrase), file)
		if !ok {
			return nil, apperr.New(apperr.KeyUnsupported)
		}
		defer zero(derived)
		if !decryptPPK(plain, derived[:32], derived[32:48]) {
			return nil, apperr.New(apperr.KeyBadPassphrase)
		}
		macKey = derived[48:80]
	}
	defer zero(macKey)

	if !verifyPPKMAC(file, plain, macKey) {
		return nil, apperr.New(apperr.KeyBadPassphrase)
	}
	privateKey, err := decodePPKPrivateKey(file.algorithm, file.public, plain)
	if err != nil {
		return nil, apperr.New(apperr.KeyUnsupported)
	}
	var block *pem.Block
	if file.encryption == "aes256-cbc" {
		block, err = ssh.MarshalPrivateKeyWithPassphrase(privateKey, file.comment, []byte(*passphrase))
	} else {
		block, err = ssh.MarshalPrivateKey(privateKey, file.comment)
	}
	if err != nil {
		return nil, apperr.New(apperr.KeyUnsupported)
	}
	return pem.EncodeToMemory(block), nil
}

func parsePPK(raw []byte) (ppkFile, error) {
	text := strings.ReplaceAll(string(raw), "\r\n", "\n")
	text = strings.TrimSuffix(text, "\n")
	lines := strings.Split(text, "\n")
	if len(lines) < 7 {
		return ppkFile{}, errPPK
	}
	var file ppkFile
	switch {
	case strings.HasPrefix(lines[0], ppkV2Prefix):
		file.version, file.algorithm = 2, strings.TrimPrefix(lines[0], ppkV2Prefix)
	case strings.HasPrefix(lines[0], ppkV3Prefix):
		file.version, file.algorithm = 3, strings.TrimPrefix(lines[0], ppkV3Prefix)
	default:
		return ppkFile{}, errPPK
	}
	if !supportedPPKAlgorithm(file.algorithm) {
		return ppkFile{}, errPPK
	}
	i := 1
	var err error
	if file.encryption, err = ppkHeader(lines, &i, "Encryption"); err != nil || (file.encryption != "none" && file.encryption != "aes256-cbc") {
		return ppkFile{}, errPPK
	}
	if file.comment, err = ppkHeader(lines, &i, "Comment"); err != nil {
		return ppkFile{}, errPPK
	}
	if file.public, err = ppkBlob(lines, &i, "Public-Lines"); err != nil {
		return ppkFile{}, errPPK
	}
	if file.version == 3 && file.encryption == "aes256-cbc" {
		if file.kdf, err = ppkHeader(lines, &i, "Key-Derivation"); err != nil {
			return ppkFile{}, errPPK
		}
		memory, err1 := ppkUint32Header(lines, &i, "Argon2-Memory")
		passes, err2 := ppkUint32Header(lines, &i, "Argon2-Passes")
		parallel, err3 := ppkUint32Header(lines, &i, "Argon2-Parallelism")
		saltHex, err4 := ppkHeader(lines, &i, "Argon2-Salt")
		file.salt, err = hex.DecodeString(saltHex)
		if err1 != nil || err2 != nil || err3 != nil || err4 != nil || err != nil || parallel > 255 {
			return ppkFile{}, errPPK
		}
		file.memory, file.passes, file.parallel = memory, passes, uint8(parallel)
	}
	if file.private, err = ppkBlob(lines, &i, "Private-Lines"); err != nil {
		return ppkFile{}, errPPK
	}
	macHex, err := ppkHeader(lines, &i, "Private-MAC")
	if err != nil || i != len(lines) {
		return ppkFile{}, errPPK
	}
	file.mac, err = hex.DecodeString(macHex)
	if err != nil || (file.version == 2 && len(file.mac) != sha1.Size) || (file.version == 3 && len(file.mac) != sha256.Size) {
		return ppkFile{}, errPPK
	}
	if file.encryption == "aes256-cbc" && len(file.private)%aes.BlockSize != 0 {
		return ppkFile{}, errPPK
	}
	return file, nil
}

var errPPK = &ppkParseError{}

type ppkParseError struct{}

func (*ppkParseError) Error() string { return "invalid PPK" }

func ppkHeader(lines []string, index *int, name string) (string, error) {
	if *index >= len(lines) {
		return "", errPPK
	}
	prefix := name + ": "
	line := lines[*index]
	*index++
	if !strings.HasPrefix(line, prefix) {
		return "", errPPK
	}
	return strings.TrimPrefix(line, prefix), nil
}

func ppkUint32Header(lines []string, index *int, name string) (uint32, error) {
	value, err := ppkHeader(lines, index, name)
	if err != nil {
		return 0, err
	}
	parsed, err := strconv.ParseUint(value, 10, 32)
	return uint32(parsed), err
}

func ppkBlob(lines []string, index *int, name string) ([]byte, error) {
	countText, err := ppkHeader(lines, index, name)
	if err != nil {
		return nil, err
	}
	count, err := strconv.Atoi(countText)
	if err != nil || count < 1 || count > domain.MaxKeyBytes/4 || *index+count > len(lines) {
		return nil, errPPK
	}
	encoded := strings.Join(lines[*index:*index+count], "")
	*index += count
	if len(encoded) > base64.StdEncoding.EncodedLen(domain.MaxKeyBytes) {
		return nil, errPPK
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(decoded) > domain.MaxKeyBytes {
		return nil, errPPK
	}
	return decoded, nil
}

func supportedPPKAlgorithm(algorithm string) bool {
	switch algorithm {
	case ssh.KeyAlgoRSA, ssh.KeyAlgoED25519, ssh.KeyAlgoECDSA256, ssh.KeyAlgoECDSA384, ssh.KeyAlgoECDSA521:
		return true
	default:
		return false
	}
}

func ppkV2EncryptionKey(passphrase []byte) []byte {
	key := make([]byte, 0, 40)
	for i := uint32(0); i < 2; i++ {
		h := sha1.New()
		var sequence [4]byte
		binary.BigEndian.PutUint32(sequence[:], i)
		h.Write(sequence[:])
		h.Write(passphrase)
		key = append(key, h.Sum(nil)...)
	}
	return key[:32]
}

func ppkV3Keys(passphrase []byte, file ppkFile) ([]byte, bool) {
	if file.memory < 8*uint32(file.parallel) || file.memory > maxPPKArgonMemory || file.passes == 0 || file.passes > maxPPKArgonPasses || file.parallel == 0 || file.parallel > maxPPKArgonLanes || len(file.salt) < 8 || len(file.salt) > 64 {
		return nil, false
	}
	switch file.kdf {
	case "Argon2i":
		return argon2.Key(passphrase, file.salt, file.passes, file.memory, file.parallel, 80), true
	case "Argon2id":
		return argon2.IDKey(passphrase, file.salt, file.passes, file.memory, file.parallel, 80), true
	default:
		return nil, false
	}
}

func decryptPPK(data, key, iv []byte) bool {
	if len(key) != 32 || len(iv) != aes.BlockSize || len(data) == 0 || len(data)%aes.BlockSize != 0 {
		return false
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return false
	}
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(data, data)
	return true
}

func verifyPPKMAC(file ppkFile, private, key []byte) bool {
	preimage := make([]byte, 0, len(file.algorithm)+len(file.encryption)+len(file.comment)+len(file.public)+len(private)+20)
	preimage = appendSSHString(preimage, []byte(file.algorithm))
	preimage = appendSSHString(preimage, []byte(file.encryption))
	preimage = appendSSHString(preimage, []byte(file.comment))
	preimage = appendSSHString(preimage, file.public)
	preimage = appendSSHString(preimage, private)
	defer zero(preimage)
	if file.version == 2 {
		mac := hmac.New(sha1.New, key)
		mac.Write(preimage)
		return hmac.Equal(file.mac, mac.Sum(nil))
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(preimage)
	return hmac.Equal(file.mac, mac.Sum(nil))
}

func appendSSHString(dst, value []byte) []byte {
	var length [4]byte
	binary.BigEndian.PutUint32(length[:], uint32(len(value)))
	dst = append(dst, length[:]...)
	return append(dst, value...)
}

func decodePPKPrivateKey(algorithm string, publicBlob, privateBlob []byte) (any, error) {
	parsed, err := ssh.ParsePublicKey(publicBlob)
	if err != nil || parsed.Type() != algorithm {
		return nil, errPPK
	}
	cryptoPublic, ok := parsed.(ssh.CryptoPublicKey)
	if !ok {
		return nil, errPPK
	}
	reader := sshBlobReader{data: privateBlob}
	switch algorithm {
	case ssh.KeyAlgoRSA:
		pub, ok := cryptoPublic.CryptoPublicKey().(*rsa.PublicKey)
		if !ok {
			return nil, errPPK
		}
		d, ok1 := reader.mpint()
		p, ok2 := reader.mpint()
		q, ok3 := reader.mpint()
		iqmp, ok4 := reader.mpint()
		if !ok1 || !ok2 || !ok3 || !ok4 || d.Sign() <= 0 || p.Sign() <= 0 || q.Sign() <= 0 {
			return nil, errPPK
		}
		wantIQMP := new(big.Int).ModInverse(q, p)
		if wantIQMP == nil || wantIQMP.Cmp(iqmp) != 0 {
			return nil, errPPK
		}
		key := &rsa.PrivateKey{PublicKey: *pub, D: d, Primes: []*big.Int{p, q}}
		if err := key.Validate(); err != nil {
			return nil, errPPK
		}
		key.Precompute()
		return key, nil
	case ssh.KeyAlgoED25519:
		pub, ok := cryptoPublic.CryptoPublicKey().(ed25519.PublicKey)
		// Apesar de o manual chamar de mpint, o PuTTY grava a semente de 32 bytes crua:
		// o primeiro byte pode ter o bit alto ligado, o que um mpint não aceitaria.
		seed, valid := reader.str()
		if !ok || !valid || len(seed) != ed25519.SeedSize {
			return nil, errPPK
		}
		key := ed25519.NewKeyFromSeed(seed)
		if !bytes.Equal(key.Public().(ed25519.PublicKey), pub) {
			return nil, errPPK
		}
		return key, nil
	default:
		pub, ok := cryptoPublic.CryptoPublicKey().(*ecdsa.PublicKey)
		d, valid := reader.mpint()
		if !ok || !valid || d.Sign() <= 0 || d.Cmp(pub.Params().N) >= 0 {
			return nil, errPPK
		}
		x, y := pub.Curve.ScalarBaseMult(d.Bytes())
		if x.Cmp(pub.X) != 0 || y.Cmp(pub.Y) != 0 {
			return nil, errPPK
		}
		return &ecdsa.PrivateKey{PublicKey: *pub, D: d}, nil
	}
}

type sshBlobReader struct {
	data []byte
}

func (r *sshBlobReader) str() ([]byte, bool) {
	if len(r.data) < 4 {
		return nil, false
	}
	length := int(binary.BigEndian.Uint32(r.data[:4]))
	if length < 0 || length > len(r.data)-4 {
		return nil, false
	}
	raw := r.data[4 : 4+length]
	r.data = r.data[4+length:]
	return raw, true
}

func (r *sshBlobReader) mpint() (*big.Int, bool) {
	raw, ok := r.str()
	if !ok {
		return nil, false
	}
	if len(raw) > 0 && raw[0]&0x80 != 0 {
		return nil, false
	}
	return new(big.Int).SetBytes(raw), true
}

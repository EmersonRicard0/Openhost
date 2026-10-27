package updater

import (
	"crypto/ed25519"
	"encoding/base64"
)

// projectPublicKeyBase64 é um placeholder intencional. O dono do projeto deve substituí-lo
// pela saída de `go run ./scripts/sign-sums -gen` antes da primeira release com atualização.
const projectPublicKeyBase64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="

func EmbeddedPublicKey() ed25519.PublicKey {
	decoded, _ := base64.StdEncoding.DecodeString(projectPublicKeyBase64)
	return ed25519.PublicKey(decoded)
}

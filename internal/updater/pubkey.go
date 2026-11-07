package updater

import (
	"crypto/ed25519"
	"encoding/base64"
)

// projectPublicKeyBase64 confere a assinatura de SHA256SUMS.txt das releases. A chave privada
// correspondente fica só no segredo UPDATE_SIGNING_KEY do repositório (scripts/sign-sums).
const projectPublicKeyBase64 = "ZZSJkXUDjfBJ1aty4ngBsJ5/5kchxilX8pjlPvLxPFQ="

func EmbeddedPublicKey() ed25519.PublicKey {
	decoded, _ := base64.StdEncoding.DecodeString(projectPublicKeyBase64)
	return ed25519.PublicKey(decoded)
}

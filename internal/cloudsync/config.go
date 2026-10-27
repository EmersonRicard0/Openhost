// Package cloudsync implementa a sincronização cifrada do cofre com Google Drive.
package cloudsync

import (
	"os"
	"strings"
)

// ClientID e ClientSecret são preenchidos nas releases com -ldflags -X. Builds locais usam
// as variáveis OPENHOST_GOOGLE_CLIENT_ID e OPENHOST_GOOGLE_CLIENT_SECRET como fallback.
var (
	ClientID     string
	ClientSecret string
)

const googleAPIBase = "https://www.googleapis.com"

type OAuthCredentials struct {
	ClientID     string
	ClientSecret string
}

func Credentials() OAuthCredentials {
	id := strings.TrimSpace(ClientID)
	secret := strings.TrimSpace(ClientSecret)
	if id == "" {
		id = strings.TrimSpace(os.Getenv("OPENHOST_GOOGLE_CLIENT_ID"))
	}
	if secret == "" {
		secret = strings.TrimSpace(os.Getenv("OPENHOST_GOOGLE_CLIENT_SECRET"))
	}
	return OAuthCredentials{ClientID: id, ClientSecret: secret}
}

func Available() bool { return Credentials().ClientID != "" }

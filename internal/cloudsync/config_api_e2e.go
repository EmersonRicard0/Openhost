//go:build e2e

package cloudsync

import (
	"errors"
	"net"
	"net/url"
)

var e2eDriveAPIBase = googleAPIBase

func configuredDriveAPIBase() string { return e2eDriveAPIBase }

func configuredOAuthEndpoints() oauthEndpoints {
	if e2eDriveAPIBase == googleAPIBase {
		return oauthEndpoints{Auth: "https://accounts.google.com/o/oauth2/v2/auth", Token: "https://oauth2.googleapis.com/token", Revoke: "https://oauth2.googleapis.com/revoke"}
	}
	return oauthEndpoints{Auth: e2eDriveAPIBase + "/auth", Token: e2eDriveAPIBase + "/token", Revoke: e2eDriveAPIBase + "/revoke"}
}

// SetDriveAPIBaseForTest existe somente no binário E2E e aceita apenas um servidor loopback.
func SetDriveAPIBaseForTest(raw string) error {
	parsed, err := url.ParseRequestURI(raw)
	if err != nil || parsed.User != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("invalid e2e Drive base")
	}
	host := parsed.Hostname()
	if host != "localhost" {
		ip := net.ParseIP(host)
		if ip == nil || !ip.IsLoopback() {
			return errors.New("e2e Drive base must be loopback")
		}
	}
	e2eDriveAPIBase = parsed.String()
	return nil
}

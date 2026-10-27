//go:build e2e

package bridge

import (
	"crypto/ed25519"
	"encoding/base64"
	"net/url"
	"strings"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/updater"
)

func (s *Services) SetUpdateSourceForTest(rawURL, publicKeyBase64 string) error {
	parsed, err := url.ParseRequestURI(rawURL)
	if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return apperr.New(apperr.InvalidInput)
	}
	publicKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(publicKeyBase64))
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return apperr.New(apperr.InvalidInput)
	}
	service := s.updateService
	service.checkMu.Lock()
	defer service.checkMu.Unlock()
	service.mu.Lock()
	service.config.ReleasesURL = parsed.String()
	service.config.PublicKey = ed25519.PublicKey(append([]byte(nil), publicKey...))
	service.current = "0.0.0"
	service.info.Current = service.current
	service.info.State = UpdateIdle
	service.info.Latest = nil
	service.releases = nil
	service.choice = nil
	service.mu.Unlock()
	_, err = service.preferences.Update(func(preferences *appwin.Preferences) error {
		preferences.Updates.ETag = ""
		return nil
	})
	return clean(err)
}

func (s *Services) SetInstallKindForTest(kind string) error {
	install := updater.Install{}
	switch kind {
	case "nsis":
		install = updater.Install{Kind: updater.InstallNSIS, Writable: true}
	case "app":
		install = updater.Install{Kind: updater.InstallApp, Writable: true}
	case "appimage":
		install = updater.Install{Kind: updater.InstallAppImage, Writable: true}
	case "deb":
		install = updater.Install{Kind: updater.InstallDEB}
	case "rpm":
		install = updater.Install{Kind: updater.InstallRPM}
	case "manual":
		install = updater.Install{Kind: updater.InstallUnmanaged}
	case "dev":
		install = updater.Install{Kind: updater.InstallDev}
	default:
		return apperr.New(apperr.InvalidInput)
	}
	service := s.updateService
	service.checkMu.Lock()
	defer service.checkMu.Unlock()
	service.mu.Lock()
	service.install = install
	service.applyChoiceLocked(service.choice)
	service.mu.Unlock()
	return nil
}

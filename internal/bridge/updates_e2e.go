//go:build e2e

package bridge

import (
	"crypto/ed25519"
	"encoding/base64"
	"net/url"
	"os"
	"strings"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/updater"
)

// configureForTest lê a origem de releases e o formato de instalação do ambiente, para a
// verificação automática ao abrir a janela já falar com o servidor local do teste. Sem as
// variáveis, o build e2e fica como dev e não faz nenhuma requisição automática.
func (s *UpdateService) configureForTest() {
	if source := os.Getenv("SHELLVAULT_E2E_UPDATE_URL"); source != "" {
		_ = s.setSource(source, os.Getenv("SHELLVAULT_E2E_UPDATE_PUBKEY"))
	}
	if kind := os.Getenv("SHELLVAULT_E2E_INSTALL_KIND"); kind != "" {
		_ = s.setInstallKind(kind)
	}
}

func (s *Services) SetUpdateSourceForTest(rawURL, publicKeyBase64 string) error {
	return s.updateService.setSource(rawURL, publicKeyBase64)
}

func (s *Services) SetInstallKindForTest(kind string) error {
	return s.updateService.setInstallKind(kind)
}

func (s *UpdateService) setSource(rawURL, publicKeyBase64 string) error {
	parsed, err := url.ParseRequestURI(rawURL)
	if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return apperr.New(apperr.InvalidInput)
	}
	publicKey, err := base64.StdEncoding.DecodeString(strings.TrimSpace(publicKeyBase64))
	if err != nil || len(publicKey) != ed25519.PublicKeySize {
		return apperr.New(apperr.InvalidInput)
	}
	s.checkMu.Lock()
	defer s.checkMu.Unlock()
	s.mu.Lock()
	s.config.ReleasesURL = parsed.String()
	s.config.PublicKey = ed25519.PublicKey(append([]byte(nil), publicKey...))
	s.current = "0.0.0"
	s.info.Current = s.current
	s.info.State = UpdateIdle
	s.info.Latest = nil
	s.releases = nil
	s.choice = nil
	s.mu.Unlock()
	_, err = s.preferences.Update(func(preferences *appwin.Preferences) error {
		preferences.Updates.ETag = ""
		return nil
	})
	return clean(err)
}

func (s *UpdateService) setInstallKind(kind string) error {
	// O sistema simulado acompanha o formato, para a escolha do pacote achar o nome certo
	// mesmo com o teste rodando no Windows.
	install := updater.Install{}
	goos := "windows"
	switch kind {
	case "nsis":
		install = updater.Install{Kind: updater.InstallNSIS, Writable: true}
	case "app":
		install, goos = updater.Install{Kind: updater.InstallApp, Writable: true}, "darwin"
	case "appimage":
		install, goos = updater.Install{Kind: updater.InstallAppImage, Writable: true}, "linux"
	case "deb":
		install, goos = updater.Install{Kind: updater.InstallDEB}, "linux"
	case "rpm":
		install, goos = updater.Install{Kind: updater.InstallRPM}, "linux"
	case "manual":
		install = updater.Install{Kind: updater.InstallUnmanaged}
	case "dev":
		install = updater.Install{Kind: updater.InstallDev}
	default:
		return apperr.New(apperr.InvalidInput)
	}
	s.checkMu.Lock()
	defer s.checkMu.Unlock()
	s.mu.Lock()
	s.install = install
	s.goos, s.goarch = goos, "amd64"
	if s.releases != nil {
		s.choice = updater.Pick(s.releases, s.current, false, s.install, s.goos, s.goarch)
	}
	s.applyChoiceLocked(s.choice)
	s.mu.Unlock()
	return nil
}

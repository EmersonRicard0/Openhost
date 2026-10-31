//go:build e2e

package bridge

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"shellvault/internal/cloudsync"
)

func syncBrowserOpener(contextFn func() context.Context) func(string) error {
	return func(rawURL string) error {
		parsed, err := url.Parse(rawURL)
		if err == nil && loopbackHost(parsed.Hostname()) {
			go func() {
				response, requestErr := (&http.Client{Timeout: 15 * time.Second}).Get(rawURL)
				if requestErr == nil {
					_ = response.Body.Close()
				}
			}()
			return nil
		}
		ctx := contextFn()
		if ctx == nil {
			return errors.New("window unavailable")
		}
		wruntime.BrowserOpenURL(ctx, rawURL)
		return nil
	}
}

func loopbackHost(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (s *SyncService) configureForTest() {
	if endpoint := os.Getenv("SHELLVAULT_E2E_CLOUD_URL"); endpoint != "" {
		_ = s.setCloudEndpoint(endpoint)
	}
}

func (s *SyncService) setCloudEndpoint(rawURL string) error {
	if err := cloudsync.SetDriveAPIBaseForTest(rawURL); err != nil {
		return err
	}
	if !cloudsync.Available() {
		cloudsync.ClientID, cloudsync.ClientSecret = "openhost-e2e", "openhost-e2e"
	}
	s.mu.Lock()
	s.oauth = cloudsync.NewOAuth(s.openBrowser)
	s.pending = nil
	s.mu.Unlock()
	return nil
}

func (s *Services) SetCloudEndpointForTest(rawURL string) error {
	return s.syncService.setCloudEndpoint(rawURL)
}

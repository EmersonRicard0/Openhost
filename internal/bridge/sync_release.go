//go:build !e2e

package bridge

import (
	"context"
	"errors"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func syncBrowserOpener(contextFn func() context.Context) func(string) error {
	return func(rawURL string) error {
		ctx := contextFn()
		if ctx == nil {
			return errors.New("window unavailable")
		}
		wruntime.BrowserOpenURL(ctx, rawURL)
		return nil
	}
}

func (s *SyncService) configureForTest() {}

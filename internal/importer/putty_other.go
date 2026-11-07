//go:build !windows

package importer

import (
	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func InstalledPuttyAvailable(string) bool { return false }

func LoadInstalledPuttyRegistry(SourceKind, *model.Content) (*ImportPreview, error) {
	return nil, apperr.New(apperr.InvalidInput)
}

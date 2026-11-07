//go:build windows

package importer

import (
	"errors"
	"os"

	"golang.org/x/sys/windows/registry"

	"shellvault/internal/model"
)

type windowsRegistryReader struct{}

func (windowsRegistryReader) Sessions(root string) ([]RegistrySession, error) {
	key, err := registry.OpenKey(registry.CURRENT_USER, root, registry.READ)
	if err != nil {
		if errors.Is(err, registry.ErrNotExist) {
			return nil, os.ErrNotExist
		}
		return nil, err
	}
	defer key.Close()
	names, err := key.ReadSubKeyNames(-1)
	if err != nil {
		return nil, err
	}
	sessions := make([]RegistrySession, 0, len(names))
	for _, name := range names {
		sessionKey, err := registry.OpenKey(key, name, registry.READ)
		if err != nil {
			continue
		}
		session := RegistrySession{Name: name}
		session.HostName, _, _ = sessionKey.GetStringValue("HostName")
		session.UserName, _, _ = sessionKey.GetStringValue("UserName")
		session.Protocol, _, _ = sessionKey.GetStringValue("Protocol")
		session.PublicKeyFile, _, _ = sessionKey.GetStringValue("PublicKeyFile")
		session.PortNumber, _, _ = sessionKey.GetIntegerValue("PortNumber")
		sessionKey.Close()
		sessions = append(sessions, session)
	}
	return sessions, nil
}

func InstalledPuttyAvailable(root string) bool {
	key, err := registry.OpenKey(registry.CURRENT_USER, root, registry.READ)
	if err != nil {
		return false
	}
	key.Close()
	return true
}

func LoadInstalledPuttyRegistry(kind SourceKind, content *model.Content) (*ImportPreview, error) {
	return LoadPuttyRegistry(kind, windowsRegistryReader{}, content)
}

package importer

import (
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

const (
	PuttyRegistryRoot = `Software\SimonTatham\PuTTY\Sessions`
	KiTTYRegistryRoot = `Software\9bis.com\KiTTY\Sessions`
)

type RegistrySession struct {
	Name          string
	HostName      string
	PortNumber    uint64
	UserName      string
	Protocol      string
	PublicKeyFile string
}

type RegistryReader interface {
	Sessions(root string) ([]RegistrySession, error)
}

func LoadPuttyRegistry(kind SourceKind, reader RegistryReader, content *model.Content) (*ImportPreview, error) {
	root, sourceLabel, originPrefix, ok := puttySource(kind)
	if !ok {
		return nil, apperr.New(apperr.InvalidInput)
	}
	sessions, err := reader.Sessions(root)
	if err != nil {
		return nil, err
	}
	return previewPutty(kind, sourceLabel, originPrefix, sessions, content)
}

func previewPutty(kind SourceKind, sourceLabel, originPrefix string, sessions []RegistrySession, content *model.Content) (*ImportPreview, error) {
	if len(sessions) > MaxRows {
		return nil, apperr.New(apperr.ImportTooLarge)
	}
	rows := make([]CandidateRow, 0, len(sessions))
	ignored := make([]IgnoredItem, 0)
	for _, session := range sessions {
		label := decodePuttyName(session.Name)
		if strings.EqualFold(label, "Default Settings") {
			ignored = append(ignored, IgnoredItem{Name: label, Reason: "Sessão padrão"})
			continue
		}
		protocol := strings.ToLower(strings.TrimSpace(session.Protocol))
		if protocol != "ssh" {
			if protocol == "" {
				protocol = "desconhecido"
			}
			ignored = append(ignored, IgnoredItem{Name: label, Reason: "Protocolo não suportado: " + protocol})
			continue
		}
		address := strings.TrimSpace(session.HostName)
		username := strings.TrimSpace(session.UserName)
		if username == "" {
			if at := strings.LastIndex(address, "@"); at > 0 && at < len(address)-1 {
				username, address = address[:at], address[at+1:]
			}
		}
		port := int(session.PortNumber)
		if port == 0 {
			port = 22
		}
		rows = append(rows, CandidateRow{
			Label:    label,
			Address:  address,
			Port:     port,
			Username: username,
			KeyPath:  strings.TrimSpace(session.PublicKeyFile),
			Origin:   originPrefix + ": " + label,
		})
	}
	preview, err := Build(kind, sourceLabel, rows, content)
	if err != nil {
		return nil, err
	}
	preview.Ignored = ignored
	if err := preview.ResolveKeys(content); err != nil {
		preview.Zero()
		return nil, err
	}
	return preview, nil
}

func LoadKiTTYPortable(root string, content *model.Content) (*ImportPreview, error) {
	sessionsDir := root
	if !strings.EqualFold(filepath.Base(filepath.Clean(root)), "Sessions") {
		sessionsDir = filepath.Join(root, "Sessions")
	}
	entries, err := os.ReadDir(sessionsDir)
	if err != nil {
		return nil, err
	}
	if len(entries) > MaxRows {
		return nil, apperr.New(apperr.ImportTooLarge)
	}
	sessions := make([]RegistrySession, 0, len(entries))
	total := int64(0)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(sessionsDir, entry.Name())
		file, err := os.Open(path)
		if err != nil {
			return nil, err
		}
		raw, readErr := io.ReadAll(io.LimitReader(file, MaxImportBytes+1))
		closeErr := file.Close()
		if readErr != nil {
			return nil, readErr
		}
		if closeErr != nil {
			return nil, closeErr
		}
		total += int64(len(raw))
		if len(raw) > MaxImportBytes || total > MaxImportBytes {
			return nil, apperr.New(apperr.ImportTooLarge)
		}
		session := parseKiTTYPortableSession(entry.Name(), raw)
		sessions = append(sessions, session)
	}
	return previewPutty(SourceKiTTYPortable, "KiTTY portátil", "KiTTY portátil", sessions, content)
}

func parseKiTTYPortableSession(name string, raw []byte) RegistrySession {
	session := RegistrySession{Name: name}
	lines := strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		separator := strings.IndexByte(line, '\\')
		if separator <= 0 {
			continue
		}
		key := line[:separator]
		value := strings.TrimSuffix(line[separator+1:], "\\")
		switch strings.ToLower(key) {
		case "hostname":
			session.HostName = value
		case "portnumber":
			if port, err := strconv.ParseUint(value, 10, 32); err == nil {
				session.PortNumber = port
			}
		case "username":
			session.UserName = value
		case "protocol":
			session.Protocol = value
		case "publickeyfile":
			session.PublicKeyFile = value
		}
	}
	return session
}

func puttySource(kind SourceKind) (root, label, origin string, ok bool) {
	switch kind {
	case SourcePuTTY:
		return PuttyRegistryRoot, "Registro do Windows (PuTTY)", "PuTTY", true
	case SourceKiTTY:
		return KiTTYRegistryRoot, "Registro do Windows (KiTTY)", "KiTTY", true
	default:
		return "", "", "", false
	}
}

func decodePuttyName(name string) string {
	decoded, err := url.PathUnescape(name)
	if err != nil {
		return name
	}
	return decoded
}

func registryUnavailable(err error) bool {
	return errors.Is(err, os.ErrNotExist)
}

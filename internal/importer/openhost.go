package importer

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/exporter"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

const maxImportBytes = 10 * 1024 * 1024

func LoadOpenHost(path string, password *string, content *model.Content) (*ImportPreview, error) {
	raw, err := readOpenHost(path)
	if err != nil {
		return nil, err
	}
	var file exporter.OpenHostFile
	if err := json.Unmarshal(raw, &file); err != nil || file.Format != exporter.Format {
		return nil, apperr.New(apperr.ImportUnreadable)
	}
	if file.Version > exporter.Version {
		return nil, apperr.New(apperr.ImportFormatNewer)
	}
	var data exporter.OpenHostData
	if file.Encrypted {
		if password == nil {
			return nil, apperr.New(apperr.FilePasswordRequired)
		}
		if file.KDF == nil || file.KDF.Alg != "argon2id" || file.KDF.Time == 0 || file.KDF.Time > 3 || file.KDF.MemoryKiB < 8 || file.KDF.MemoryKiB > 256*1024 || file.Version != exporter.Version {
			return nil, apperr.New(apperr.FilePasswordWrong)
		}
		salt, err := base64.StdEncoding.DecodeString(file.KDF.Salt)
		if err != nil || len(salt) != vault.SaltSize {
			return nil, apperr.New(apperr.FilePasswordWrong)
		}
		sealed, err := base64.StdEncoding.DecodeString(file.Payload)
		if err != nil {
			return nil, apperr.New(apperr.FilePasswordWrong)
		}
		params := vault.KDFParams{Time: file.KDF.Time, MemoryKiB: file.KDF.MemoryKiB, Salt: salt}
		kek := vault.DeriveKEK([]byte(*password), params)
		plain, err := vault.Unseal(kek, sealed, exporter.OpenHostAD(file.Format, file.Version, *file.KDF))
		vault.Zero(kek)
		if err != nil {
			return nil, apperr.New(apperr.FilePasswordWrong)
		}
		defer vault.Zero(plain)
		if err := json.Unmarshal(plain, &data); err != nil {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
	} else {
		if file.Version != exporter.Version || file.Data == nil || len(file.Payload) != 0 || file.KDF != nil {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		data = *file.Data
		if len(data.Keys) != 0 {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
	}
	return previewOpenHost(filepath.Base(path), data, content)
}

func readOpenHost(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, maxImportBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > maxImportBytes {
		return nil, apperr.New(apperr.ImportTooLarge)
	}
	return raw, nil
}

func previewOpenHost(sourceLabel string, data exporter.OpenHostData, content *model.Content) (*ImportPreview, error) {
	if len(data.Hosts) > MaxRows {
		return nil, apperr.New(apperr.ImportTooLarge)
	}
	groups := make(map[string]model.Group, len(data.Groups))
	for _, group := range data.Groups {
		if group.ID == "" {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		if _, exists := groups[group.ID]; exists {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		groups[group.ID] = group
	}
	paths := make(map[string][]string, len(groups))
	visiting := map[string]bool{}
	var groupPath func(string) ([]string, error)
	groupPath = func(id string) ([]string, error) {
		if path, ok := paths[id]; ok {
			return append([]string(nil), path...), nil
		}
		group, ok := groups[id]
		if !ok || visiting[id] {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		visiting[id] = true
		var path []string
		if group.ParentID != nil {
			parent, err := groupPath(*group.ParentID)
			if err != nil {
				return nil, err
			}
			path = append(path, parent...)
		}
		path = append(path, group.Name)
		visiting[id] = false
		paths[id] = path
		return append([]string(nil), path...), nil
	}
	for id := range groups {
		if _, err := groupPath(id); err != nil {
			return nil, err
		}
	}

	keys := make(map[string]exporter.OpenHostKey, len(data.Keys))
	for _, key := range data.Keys {
		if key.ID == "" || key.PrivateKey == "" {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		if _, exists := keys[key.ID]; exists {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		keys[key.ID] = key
	}
	rules := map[string][]exporter.OpenHostForwardRule{}
	for _, rule := range data.ForwardRules {
		rules[rule.HostID] = append(rules[rule.HostID], rule)
	}
	hostIDs := map[string]bool{}
	candidates := make([]CandidateRow, 0, len(data.Hosts))
	for _, host := range data.Hosts {
		if host.ID == "" || hostIDs[host.ID] {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		hostIDs[host.ID] = true
		var path []string
		if host.GroupID != nil {
			var err error
			path, err = groupPath(*host.GroupID)
			if err != nil {
				return nil, err
			}
		}
		keyPath := ""
		if host.KeyID != nil {
			if _, ok := keys[*host.KeyID]; !ok {
				return nil, apperr.New(apperr.ImportUnreadable)
			}
			keyPath = "openhost-key:" + *host.KeyID
		}
		extra := map[string]any{
			"legacyAlgorithms": host.LegacyAlgorithms,
			"osIcon":           host.OSIcon,
			"authMethod":       string(host.AuthMethod),
			"forwardRules":     append([]exporter.OpenHostForwardRule(nil), rules[host.ID]...),
			"profile":          nil,
		}
		if host.Profile != nil {
			profile := *host.Profile
			profile.ID = domain.NewID()
			profile.IsGlobal = false
			extra["profile"] = profile
		}
		candidates = append(candidates, CandidateRow{Label: host.Label, Address: host.Address, Port: host.Port, Username: host.Username, GroupPath: path, KeyPath: keyPath, Origin: sourceLabel, Extra: extra})
	}
	for hostID := range rules {
		if !hostIDs[hostID] {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
	}
	preview, err := Build(SourceOpenHost, sourceLabel, candidates, content)
	if err != nil {
		return nil, err
	}
	preview.Groups = preview.Groups[:0]
	preview.groupSortOrders = make(map[string]int, len(data.Groups))
	for _, group := range data.Groups {
		path := append([]string(nil), paths[group.ID]...)
		preview.Groups = append(preview.Groups, PreviewGroup{Path: path, Name: group.Name})
		preview.groupSortOrders[strings.Join(path, "\x00")] = group.SortOrder
	}
	for _, credential := range content.Credentials {
		if credential.Kind == model.CredentialKey && credential.Fingerprint != "" {
			preview.credentialByFingerprint[credential.Fingerprint] = credential.ID
		}
	}
	for i := range preview.Keys {
		previewKey := &preview.Keys[i]
		id := string(bytes.TrimPrefix([]byte(previewKey.Path), []byte("openhost-key:")))
		key, ok := keys[id]
		if !ok {
			preview.Zero()
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		parsed, err := domain.ParsePrivateKey(key.PrivateKey, key.Passphrase)
		if err != nil {
			preview.Zero()
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		secret := &keySecret{privateKey: []byte(key.PrivateKey)}
		if key.Passphrase != nil {
			secret.passphrase = []byte(*key.Passphrase)
		}
		preview.keyData[previewKey.Ref] = secret
		previewKey.Name, previewKey.Path = key.Name, key.Name
		setParsedKey(previewKey, secret, parsed, preview.credentialByFingerprint)
	}
	preview.syncKeyWarnings()
	return preview, nil
}

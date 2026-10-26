package bridge

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"shellvault/internal/apperr"
	"shellvault/internal/exporter"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

type ExportFormat string

const ExportFormatOpenHost ExportFormat = "openhost"

type ExportScopeKind string

const (
	ExportScopeAll   ExportScopeKind = "all"
	ExportScopeGroup ExportScopeKind = "group"
	ExportScopeHosts ExportScopeKind = "hosts"
)

type ExportScope struct {
	Kind    ExportScopeKind `json:"kind"`
	GroupID string          `json:"groupId,omitempty"`
	HostIDs []string        `json:"hostIds,omitempty"`
}

type ExportRequest struct {
	Format         ExportFormat `json:"format"`
	Scope          ExportScope  `json:"scope"`
	IncludeKeys    bool         `json:"includeKeys"`
	MasterPassword string       `json:"masterPassword,omitempty"`
	FilePassword   string       `json:"filePassword,omitempty"`
	SSHConfigMode  string       `json:"sshConfigMode,omitempty"`
}

type ExportCount struct {
	Hosts  int `json:"hosts"`
	Groups int `json:"groups"`
	Keys   int `json:"keys"`
}

type ExportResult struct {
	Path  string `json:"path"`
	Hosts int    `json:"hosts"`
	Keys  int    `json:"keys"`
}

type ExportService struct {
	store    *vault.Store
	context  func() context.Context
	saveFile func(context.Context) (string, error)
	kdf      func([]byte) vault.KDFParams
}

func newExportService(store *vault.Store, contextFn func() context.Context) *ExportService {
	return &ExportService{
		store: store, context: contextFn, kdf: vault.DefaultKDF,
		saveFile: func(ctx context.Context) (string, error) {
			if path := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); path != "" {
				return path, nil
			}
			return wruntime.SaveFileDialog(ctx, wruntime.SaveDialogOptions{
				Title: "Exportar hosts", DefaultFilename: "hosts.openhost",
				Filters: []wruntime.FileFilter{{DisplayName: "Arquivo OpenHost", Pattern: "*.openhost"}},
			})
		},
	}
}

func (s *ExportService) Count(scope ExportScope) (ExportCount, error) {
	content, err := s.store.Read()
	if err != nil {
		return ExportCount{}, clean(err)
	}
	selected, err := selectExportContent(content, scope)
	if err != nil {
		return ExportCount{}, clean(err)
	}
	return countExport(selected), nil
}

func (s *ExportService) Export(request ExportRequest) (*ExportResult, error) {
	if request.Format != ExportFormatOpenHost {
		return nil, apperr.New(apperr.InvalidInput)
	}
	content, err := s.store.Read()
	if err != nil {
		return nil, clean(err)
	}
	selected, err := selectExportContent(content, request.Scope)
	if err != nil {
		return nil, clean(err)
	}
	if request.IncludeKeys {
		if err := s.store.VerifyPassword(request.MasterPassword); err != nil {
			return nil, clean(err)
		}
		if utf8.RuneCountInString(request.FilePassword) < vault.MinPasswordLength || utf8.RuneCountInString(request.FilePassword) > 1024 {
			return nil, apperr.New(apperr.WeakPassword)
		}
	}
	path, err := s.saveFile(s.context())
	if err != nil {
		return nil, clean(err)
	}
	if path == "" {
		return nil, nil
	}
	if !strings.EqualFold(filepath.Ext(path), ".openhost") {
		path += ".openhost"
	}
	profiles := make(map[string]*model.TerminalProfile)
	for _, host := range selected.Hosts {
		if host.ProfileID == nil {
			continue
		}
		profile, err := s.store.HostProfile(host.ID)
		if err != nil {
			return nil, clean(err)
		}
		profiles[host.ID] = profile
	}
	raw, err := exporter.MarshalOpenHost(selected, exporter.OpenHostOptions{
		Profiles: profiles, IncludeKeys: request.IncludeKeys,
		FilePassword: request.FilePassword, KDF: s.kdf,
	})
	if err != nil {
		return nil, clean(err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return nil, clean(err)
	}
	count := countExport(selected)
	keys := 0
	if request.IncludeKeys {
		keys = count.Keys
	}
	return &ExportResult{Path: path, Hosts: count.Hosts, Keys: keys}, nil
}

func selectExportContent(content *model.Content, scope ExportScope) (*model.Content, error) {
	groupIDs := map[string]bool{}
	hostIDs := map[string]bool{}
	groupsByID := make(map[string]model.Group, len(content.Groups))
	for _, group := range content.Groups {
		groupsByID[group.ID] = group
	}
	switch scope.Kind {
	case ExportScopeAll:
		for _, group := range content.Groups {
			groupIDs[group.ID] = true
		}
		for _, host := range content.Hosts {
			hostIDs[host.ID] = true
		}
	case ExportScopeGroup:
		if _, ok := groupsByID[scope.GroupID]; !ok {
			return nil, apperr.New(apperr.InvalidInput)
		}
		groupIDs[scope.GroupID] = true
		changed := true
		for changed {
			changed = false
			for _, group := range content.Groups {
				if group.ParentID != nil && groupIDs[*group.ParentID] && !groupIDs[group.ID] {
					groupIDs[group.ID], changed = true, true
				}
			}
		}
		for _, host := range content.Hosts {
			if host.GroupID != nil && groupIDs[*host.GroupID] {
				hostIDs[host.ID] = true
			}
		}
	case ExportScopeHosts:
		known := make(map[string]bool, len(content.Hosts))
		for _, host := range content.Hosts {
			known[host.ID] = true
		}
		for _, id := range scope.HostIDs {
			if !known[id] {
				return nil, apperr.New(apperr.InvalidInput)
			}
			hostIDs[id] = true
		}
		for _, host := range content.Hosts {
			if !hostIDs[host.ID] || host.GroupID == nil {
				continue
			}
			id := *host.GroupID
			for id != "" {
				if groupIDs[id] {
					break
				}
				group, ok := groupsByID[id]
				if !ok {
					return nil, apperr.New(apperr.InvalidInput)
				}
				groupIDs[id] = true
				if group.ParentID == nil {
					break
				}
				id = *group.ParentID
			}
		}
	default:
		return nil, apperr.New(apperr.InvalidInput)
	}
	selected := model.EmptyContent()
	selected.Settings = content.Settings
	for _, group := range content.Groups {
		if groupIDs[group.ID] {
			selected.Groups = append(selected.Groups, group)
		}
	}
	credentialIDs := map[string]bool{}
	for _, host := range content.Hosts {
		if hostIDs[host.ID] {
			selected.Hosts = append(selected.Hosts, host)
			if host.CredentialID != nil {
				credentialIDs[*host.CredentialID] = true
			}
		}
	}
	for _, credential := range content.Credentials {
		if credentialIDs[credential.ID] {
			selected.Credentials = append(selected.Credentials, credential)
		}
	}
	for _, rule := range content.ForwardRules {
		if hostIDs[rule.HostID] {
			selected.ForwardRules = append(selected.ForwardRules, rule)
		}
	}
	return selected, nil
}

func countExport(content *model.Content) ExportCount {
	keys := 0
	for _, credential := range content.Credentials {
		if credential.Kind == model.CredentialKey {
			keys++
		}
	}
	return ExportCount{Hosts: len(content.Hosts), Groups: len(content.Groups), Keys: keys}
}

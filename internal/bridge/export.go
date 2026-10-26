package bridge

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"shellvault/internal/apperr"
	"shellvault/internal/exporter"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

type ExportFormat string

const (
	ExportFormatOpenHost ExportFormat = "openhost"
	ExportFormatOpenSSH  ExportFormat = "openssh"
	ExportFormatCSV      ExportFormat = "csv"
)

// saveDialogs dá título, nome sugerido e filtro do diálogo de salvar por formato.
var saveDialogs = map[ExportFormat]wruntime.SaveDialogOptions{
	ExportFormatOpenHost: {
		Title: "Exportar hosts", DefaultFilename: "hosts.openhost",
		Filters: []wruntime.FileFilter{{DisplayName: "Arquivo OpenHost", Pattern: "*.openhost"}},
	},
	ExportFormatOpenSSH: {
		Title: "Exportar para o OpenSSH", DefaultFilename: "config",
		Filters: []wruntime.FileFilter{{DisplayName: "Configuração do OpenSSH", Pattern: "*"}},
	},
	ExportFormatCSV: {
		Title: "Exportar planilha", DefaultFilename: "hosts.csv",
		Filters: []wruntime.FileFilter{{DisplayName: "Planilha CSV", Pattern: "*.csv"}},
	},
}

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
	saveFile func(context.Context, ExportFormat) (string, error)
	kdf      func([]byte) vault.KDFParams
	// sshConfigPath é o ~/.ssh/config do usuário, que só recebe o trecho entre marcadores.
	sshConfigPath func() string
	now           func() time.Time
}

func newExportService(store *vault.Store, contextFn func() context.Context) *ExportService {
	return &ExportService{
		store: store, context: contextFn, kdf: vault.DefaultKDF, now: time.Now,
		saveFile: func(ctx context.Context, format ExportFormat) (string, error) {
			if path := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); path != "" {
				return path, nil
			}
			return wruntime.SaveFileDialog(ctx, saveDialogs[format])
		},
		sshConfigPath: func() string {
			home, err := os.UserHomeDir()
			if err != nil || home == "" {
				return ""
			}
			return filepath.Join(home, ".ssh", "config")
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
	if _, ok := saveDialogs[request.Format]; !ok {
		return nil, apperr.New(apperr.InvalidInput)
	}
	// Chaves só no formato do OpenHost, que pode ser cifrado (FR-326, FR-327).
	if request.IncludeKeys && request.Format != ExportFormatOpenHost {
		return nil, apperr.New(apperr.InvalidInput)
	}
	mode := exporter.SSHConfigMode(request.SSHConfigMode)
	if mode != "" && mode != exporter.SSHConfigNewFile && mode != exporter.SSHConfigAppend {
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
	path, err := s.saveFile(s.context(), request.Format)
	if err != nil {
		return nil, clean(err)
	}
	if path == "" {
		return nil, nil
	}
	count := countExport(selected)
	switch request.Format {
	case ExportFormatOpenSSH:
		if err := s.writeOpenSSH(path, selected, mode); err != nil {
			return nil, clean(err)
		}
		return &ExportResult{Path: path, Hosts: count.Hosts}, nil
	case ExportFormatCSV:
		if !strings.EqualFold(filepath.Ext(path), ".csv") {
			path += ".csv"
		}
		if err := exporter.WriteFile(path, exporter.MarshalCSV(selected)); err != nil {
			return nil, clean(err)
		}
		return &ExportResult{Path: path, Hosts: count.Hosts}, nil
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
	keys := 0
	if request.IncludeKeys {
		keys = count.Keys
	}
	return &ExportResult{Path: path, Hosts: count.Hosts, Keys: keys}, nil
}

// writeOpenSSH grava os blocos Host. O ~/.ssh/config do usuário nunca é sobrescrito: exige
// sshConfigMode e só aceita acrescentar entre marcadores (FR-328); outro destino recebe o
// arquivo inteiro (o diálogo do sistema já confirmou a substituição).
func (s *ExportService) writeOpenSSH(path string, content *model.Content, mode exporter.SSHConfigMode) error {
	blocks := exporter.MarshalOpenSSH(content)
	if !samePath(path, s.sshConfigPath()) {
		return exporter.WriteSSHConfig(path, blocks, exporter.SSHConfigNewFile, s.now())
	}
	switch mode {
	case exporter.SSHConfigAppend:
		return exporter.WriteSSHConfig(path, blocks, exporter.SSHConfigAppend, s.now())
	case exporter.SSHConfigNewFile:
		err := apperr.New(apperr.AlreadyExists)
		err.Detail = "o ~/.ssh/config só pode receber os hosts ao final; salve com outro nome"
		return err
	default:
		return apperr.New(apperr.InvalidInput)
	}
}

func samePath(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	absA, errA := filepath.Abs(a)
	absB, errB := filepath.Abs(b)
	return errA == nil && errB == nil && strings.EqualFold(filepath.Clean(absA), filepath.Clean(absB))
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

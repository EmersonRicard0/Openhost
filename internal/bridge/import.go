package bridge

import (
	"context"
	"os"
	"path/filepath"
	"sort"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"shellvault/internal/apperr"
	"shellvault/internal/importer"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

type ImportSource struct {
	Kind         importer.SourceKind `json:"kind"`
	Available    bool                `json:"available"`
	DefaultFound bool                `json:"defaultFound"`
}
type PreviewOptions struct {
	UseDefault   bool            `json:"useDefault"`
	FilePassword *string         `json:"filePassword"`
	CSVMapping   map[string]*int `json:"csvMapping"`
}
type sourceLoader struct {
	source ImportSource
	load   func(string, PreviewOptions, *model.Content) (*importer.ImportPreview, error)
}

type ImportService struct {
	store       *vault.Store
	coordinator *importer.Coordinator
	context     func() context.Context
	sources     map[importer.SourceKind]sourceLoader
	pickFile    func(context.Context, importer.SourceKind) (string, error)
	saveFile    func(context.Context) (string, error)
}

func newImportService(store *vault.Store, contextFn func() context.Context) *ImportService {
	s := &ImportService{store: store, coordinator: importer.NewCoordinator(store), context: contextFn, sources: map[importer.SourceKind]sourceLoader{},
		pickFile: func(ctx context.Context, kind importer.SourceKind) (string, error) {
			if path := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); path != "" {
				return path, nil
			}
			return wruntime.OpenFileDialog(ctx, wruntime.OpenDialogOptions{Title: "Importar hosts", Filters: []wruntime.FileFilter{{DisplayName: "Arquivos de importação", Pattern: "*"}}})
		},
		saveFile: func(ctx context.Context) (string, error) {
			if path := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); path != "" {
				return path, nil
			}
			return wruntime.SaveFileDialog(ctx, wruntime.SaveDialogOptions{Title: "Salvar modelo CSV", DefaultFilename: "modelo-hosts.csv", Filters: []wruntime.FileFilter{{DisplayName: "Planilha CSV", Pattern: "*.csv"}}})
		},
	}
	s.registerOpenSSH()
	return s
}

func (s *ImportService) registerOpenSSH() {
	home, err := os.UserHomeDir()
	available := err == nil && home != ""
	defaultPath := ""
	defaultFound := false
	if available {
		defaultPath = filepath.Join(home, ".ssh", "config")
		if info, statErr := os.Stat(defaultPath); statErr == nil && !info.IsDir() {
			defaultFound = true
		}
	}
	localUser := os.Getenv("USERNAME")
	if localUser == "" {
		localUser = os.Getenv("USER")
	}
	s.sources[importer.SourceOpenSSH] = sourceLoader{
		source: ImportSource{Kind: importer.SourceOpenSSH, Available: available, DefaultFound: defaultFound},
		load: func(path string, _ PreviewOptions, content *model.Content) (*importer.ImportPreview, error) {
			if path == "" {
				path = defaultPath
			}
			return importer.LoadOpenSSH(path, importer.OpenSSHOptions{HomeDir: home, LocalUser: localUser}, content)
		},
	}
}

func (s *ImportService) Sources() ([]ImportSource, error) {
	out := make([]ImportSource, 0, len(s.sources))
	for _, source := range s.sources {
		out = append(out, source.source)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Kind < out[j].Kind })
	return out, nil
}
func (s *ImportService) Preview(kind importer.SourceKind, options PreviewOptions) (*importer.PreviewView, error) {
	loader, ok := s.sources[kind]
	if !ok || !loader.source.Available {
		return nil, apperr.New(apperr.InvalidInput)
	}
	content, err := s.store.Read()
	if err != nil {
		return nil, clean(err)
	}
	path := ""
	if !options.UseDefault {
		path, err = s.pickFile(s.context(), kind)
		if err != nil {
			return nil, clean(err)
		}
		if path == "" {
			return nil, nil
		}
	}
	preview, err := loader.load(path, options, content)
	if err != nil {
		return nil, clean(err)
	}
	s.coordinator.SetPreview(preview)
	view := preview.View()
	return &view, nil
}
func (s *ImportService) RemapCsv(previewID string, mapping map[string]*int) (importer.PreviewView, error) {
	return importer.PreviewView{}, apperr.New(apperr.InvalidInput)
}
func (s *ImportService) UpdateRow(previewID, rowID string, patch importer.RowPatch) (importer.PreviewView, error) {
	p, err := s.coordinator.Preview(previewID)
	if err != nil {
		return importer.PreviewView{}, clean(err)
	}
	content, err := s.store.Read()
	if err != nil {
		return importer.PreviewView{}, clean(err)
	}
	// Devolve a prévia inteira: corrigir uma linha pode mudar o duplicado de outras.
	if err = p.UpdateRow(rowID, patch, content); err != nil {
		return importer.PreviewView{}, clean(err)
	}
	return p.View(), nil
}
func (s *ImportService) SelectAll(previewID string, selected bool, groupPath *[]string) (importer.PreviewView, error) {
	p, err := s.coordinator.Preview(previewID)
	if err != nil {
		return importer.PreviewView{}, clean(err)
	}
	p.SelectAll(selected, groupPath)
	return p.View(), nil
}
func (s *ImportService) SetDuplicateAction(previewID string, action importer.DuplicateAction) (importer.PreviewView, error) {
	p, err := s.coordinator.Preview(previewID)
	if err != nil {
		return importer.PreviewView{}, clean(err)
	}
	if err = p.SetDuplicateAction(action); err != nil {
		return importer.PreviewView{}, clean(err)
	}
	return p.View(), nil
}
func (s *ImportService) UnlockKey(previewID, keyRef, passphrase string) (importer.PreviewKey, error) {
	p, err := s.coordinator.Preview(previewID)
	if err != nil {
		return importer.PreviewKey{}, clean(err)
	}
	key, err := p.UnlockKey(keyRef, passphrase)
	return key, clean(err)
}
func (s *ImportService) SkipKey(previewID, keyRef string) (importer.PreviewKey, error) {
	p, err := s.coordinator.Preview(previewID)
	if err != nil {
		return importer.PreviewKey{}, clean(err)
	}
	key, err := p.SkipKey(keyRef)
	return key, clean(err)
}
func (s *ImportService) Commit(previewID string, targetGroupID *string) (importer.ImportResult, error) {
	result, err := s.coordinator.Commit(previewID, targetGroupID)
	return result, clean(err)
}
func (s *ImportService) Undo(batchID string) (importer.UndoResult, error) {
	result, err := s.coordinator.Undo(batchID)
	return result, clean(err)
}
func (s *ImportService) Discard(previewID string) error { s.coordinator.Discard(previewID); return nil }
func (s *ImportService) SaveCsvTemplate() (bool, error) {
	path, err := s.saveFile(s.context())
	if err != nil {
		return false, clean(err)
	}
	if path == "" {
		return false, nil
	}
	if filepath.Ext(path) == "" {
		path += ".csv"
	}
	const template = "\ufeffnome;endereco;porta;usuario;grupo;chave\r\nServidor de exemplo;192.0.2.10;22;usuario;Clientes/Norte;\r\n"
	if err = os.WriteFile(path, []byte(template), 0600); err != nil {
		return false, clean(err)
	}
	return true, nil
}

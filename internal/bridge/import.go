package bridge

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
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
	pickDir     func(context.Context, importer.SourceKind) (string, error)
	saveFile    func(context.Context) (string, error)
	pendingKind importer.SourceKind
	pendingPath string
}

func newImportService(store *vault.Store, contextFn func() context.Context) *ImportService {
	s := &ImportService{store: store, coordinator: importer.NewCoordinator(store), context: contextFn, sources: map[importer.SourceKind]sourceLoader{},
		pickFile: func(ctx context.Context, kind importer.SourceKind) (string, error) {
			if path := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); path != "" {
				return path, nil
			}
			return wruntime.OpenFileDialog(ctx, wruntime.OpenDialogOptions{Title: "Importar hosts", Filters: []wruntime.FileFilter{{DisplayName: "Arquivos de importação", Pattern: "*"}}})
		},
		pickDir: func(ctx context.Context, kind importer.SourceKind) (string, error) {
			if path := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); path != "" {
				return path, nil
			}
			return wruntime.OpenDirectoryDialog(ctx, wruntime.OpenDialogOptions{Title: "Selecionar pasta do KiTTY portátil"})
		},
		saveFile: func(ctx context.Context) (string, error) {
			if path := os.Getenv("SHELLVAULT_TEST_DIALOG_PATH"); path != "" {
				return path, nil
			}
			return wruntime.SaveFileDialog(ctx, wruntime.SaveDialogOptions{Title: "Salvar modelo CSV", DefaultFilename: "modelo-hosts.csv", Filters: []wruntime.FileFilter{{DisplayName: "Planilha CSV", Pattern: "*.csv"}}})
		},
	}
	s.registerOpenSSH()
	s.registerOpenHost()
	s.sources[importer.SourceCSV] = sourceLoader{
		source: ImportSource{Kind: importer.SourceCSV, Available: true},
		load: func(path string, options PreviewOptions, content *model.Content) (*importer.ImportPreview, error) {
			return importer.LoadCSV(path, options.CSVMapping, content)
		},
	}
	s.registerPutty()
	return s
}

func (s *ImportService) registerPutty() {
	available := runtime.GOOS == "windows"
	s.sources[importer.SourcePuTTY] = sourceLoader{
		source: ImportSource{Kind: importer.SourcePuTTY, Available: available, DefaultFound: available && importer.InstalledPuttyAvailable(importer.PuttyRegistryRoot)},
		load: func(_ string, _ PreviewOptions, content *model.Content) (*importer.ImportPreview, error) {
			return importer.LoadInstalledPuttyRegistry(importer.SourcePuTTY, content)
		},
	}
	s.sources[importer.SourceKiTTY] = sourceLoader{
		source: ImportSource{Kind: importer.SourceKiTTY, Available: available, DefaultFound: available && importer.InstalledPuttyAvailable(importer.KiTTYRegistryRoot)},
		load: func(_ string, _ PreviewOptions, content *model.Content) (*importer.ImportPreview, error) {
			return importer.LoadInstalledPuttyRegistry(importer.SourceKiTTY, content)
		},
	}
	s.sources[importer.SourceKiTTYPortable] = sourceLoader{
		source: ImportSource{Kind: importer.SourceKiTTYPortable, Available: available},
		load: func(path string, _ PreviewOptions, content *model.Content) (*importer.ImportPreview, error) {
			return importer.LoadKiTTYPortable(path, content)
		},
	}
}

func (s *ImportService) registerOpenHost() {
	s.sources[importer.SourceOpenHost] = sourceLoader{
		source: ImportSource{Kind: importer.SourceOpenHost, Available: true},
		load: func(path string, options PreviewOptions, content *model.Content) (*importer.ImportPreview, error) {
			return importer.LoadOpenHost(path, options.FilePassword, content)
		},
	}
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
	reusePending := options.FilePassword != nil && s.pendingKind == kind && s.pendingPath != ""
	if reusePending {
		path = s.pendingPath
	} else if kind != importer.SourcePuTTY && kind != importer.SourceKiTTY && !options.UseDefault {
		s.pendingKind, s.pendingPath = "", ""
		if kind == importer.SourceKiTTYPortable {
			path, err = s.pickDir(s.context(), kind)
		} else {
			path, err = s.pickFile(s.context(), kind)
		}
		if err != nil {
			return nil, clean(err)
		}
		if path == "" {
			return nil, nil
		}
	}
	preview, err := loader.load(path, options, content)
	if err != nil {
		code := apperr.CodeOf(err)
		if path != "" && (code == apperr.FilePasswordRequired || code == apperr.FilePasswordWrong) {
			s.pendingKind, s.pendingPath = kind, path
		} else {
			s.pendingKind, s.pendingPath = "", ""
		}
		return nil, clean(err)
	}
	s.pendingKind, s.pendingPath = "", ""
	s.coordinator.SetPreview(preview)
	view := preview.View()
	return &view, nil
}
func (s *ImportService) RemapCsv(previewID string, mapping map[string]*int) (importer.PreviewView, error) {
	p, err := s.coordinator.Preview(previewID)
	if err != nil {
		return importer.PreviewView{}, clean(err)
	}
	content, err := s.store.Read()
	if err != nil {
		return importer.PreviewView{}, clean(err)
	}
	// Reinterpreta a planilha já lida; a prévia nova substitui a anterior.
	remapped, err := importer.RemapCSV(p, mapping, content)
	if err != nil {
		return importer.PreviewView{}, clean(err)
	}
	s.coordinator.SetPreview(remapped)
	return remapped.View(), nil
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
	if err = os.WriteFile(path, importer.CSVTemplate(), 0600); err != nil {
		return false, clean(err)
	}
	return true, nil
}

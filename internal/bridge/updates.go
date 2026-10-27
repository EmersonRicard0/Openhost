package bridge

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/updater"
)

const EventUpdatesState = "updates:state"

type UpdateState string

const (
	UpdateIdle        UpdateState = "idle"
	UpdateChecking    UpdateState = "checking"
	UpdateUpToDate    UpdateState = "upToDate"
	UpdateAvailable   UpdateState = "available"
	UpdateDownloading UpdateState = "downloading"
	UpdateVerifying   UpdateState = "verifying"
	UpdateReady       UpdateState = "ready"
	UpdateApplying    UpdateState = "applying"
	UpdateFailed      UpdateState = "failed"
)

type UpdateFailure string

const (
	UpdateFailureNetwork    UpdateFailure = "network"
	UpdateFailureDiskSpace  UpdateFailure = "diskSpace"
	UpdateFailureSignature  UpdateFailure = "signature"
	UpdateFailureChecksum   UpdateFailure = "checksum"
	UpdateFailurePermission UpdateFailure = "permission"
	UpdateFailureInstall    UpdateFailure = "install"
)

type UpdateProgress = updater.Progress

type UpdateInfo struct {
	Current       string          `json:"current"`
	Latest        *string         `json:"latest"`
	Prerelease    bool            `json:"prerelease"`
	Notes         string          `json:"notes"`
	Install       string          `json:"install"`
	OneClick      bool            `json:"oneClick"`
	ManualCommand *string         `json:"manualCommand"`
	CheckedAt     string          `json:"checkedAt"`
	Notify        bool            `json:"notify"`
	State         UpdateState     `json:"state"`
	Progress      *UpdateProgress `json:"progress"`
	Reason        *UpdateFailure  `json:"reason"`
}

type UpdateStateEvent struct {
	State    UpdateState     `json:"state"`
	Version  string          `json:"version,omitempty"`
	Progress *UpdateProgress `json:"progress,omitempty"`
	Reason   *UpdateFailure  `json:"reason,omitempty"`
}

type UpdatePrefs struct {
	Auto       bool `json:"auto"`
	Prerelease bool `json:"prerelease"`
}

type UpdateResult struct {
	Version string         `json:"version"`
	Status  string         `json:"status"`
	Reason  *UpdateFailure `json:"reason,omitempty"`
}

type UpdateService struct {
	mu      sync.RWMutex
	checkMu sync.Mutex

	preferences *appwin.PreferenceStore
	dataDir     string
	context     func() context.Context
	emit        func(string, any)
	config      updater.Config
	install     updater.Install
	current     string
	goos        string
	goarch      string
	now         func() time.Time

	info     UpdateInfo
	releases []updater.Release
	choice   *updater.Choice
	ready    *readyUpdate

	checkInterval   time.Duration
	cancel          context.CancelFunc
	downloadCancel  context.CancelFunc
	pendingHelper   string
	pendingManifest string
	stopping        bool
	worker          sync.WaitGroup
	launchHelper    func(string, string) error
	openFolder      func(string) error
	quit            func()
}

type readyUpdate struct {
	version     string
	packagePath string
	checksums   string
	signature   string
}

func newUpdateService(
	dataDir string,
	preferences *appwin.PreferenceStore,
	contextFn func() context.Context,
	emit func(string, any),
) *UpdateService {
	current := updater.CurrentVersion()
	if current == "" {
		current = "dev"
	}
	install := updater.DetectInstall()
	installName, oneClick, command := updateInstallPresentation(install)
	return &UpdateService{
		preferences:   preferences,
		dataDir:       dataDir,
		context:       contextFn,
		emit:          emit,
		config:        updater.Config{UserAgent: "OpenHost/" + current, PublicKey: updater.EmbeddedPublicKey()},
		install:       install,
		current:       current,
		goos:          runtime.GOOS,
		goarch:        runtime.GOARCH,
		now:           time.Now,
		info:          UpdateInfo{Current: current, Install: installName, OneClick: oneClick, ManualCommand: command, State: UpdateIdle},
		checkInterval: 6 * time.Hour,
		launchHelper:  launchUpdateHelper,
		openFolder:    openUpdateFolder,
	}
}

func (s *UpdateService) Info() (UpdateInfo, error) {
	preferences, err := s.preferences.Get()
	if err != nil {
		return UpdateInfo{}, clean(err)
	}
	s.mu.RLock()
	info := cloneUpdateInfo(s.info)
	s.mu.RUnlock()
	info.Notify = shouldNotify(info.Latest, preferences.Updates, s.now())
	return info, nil
}

func (s *UpdateService) Check(manual bool) (UpdateInfo, error) {
	s.checkMu.Lock()
	defer s.checkMu.Unlock()

	preferences, err := s.preferences.Get()
	if err != nil {
		return UpdateInfo{}, clean(err)
	}
	s.mu.RLock()
	development := s.install.Kind == updater.InstallDev
	s.mu.RUnlock()
	// Build de desenvolvimento nunca recebe atualização: a verificação automática nem vai à rede.
	if !manual && (!preferences.Updates.Auto || development) {
		return s.Info()
	}
	s.mu.RLock()
	busy := s.info.State == UpdateDownloading || s.info.State == UpdateVerifying || s.info.State == UpdateReady || s.info.State == UpdateApplying
	s.mu.RUnlock()
	if busy {
		if manual {
			return UpdateInfo{}, apperr.New(apperr.InvalidInput)
		}
		return s.Info()
	}

	s.mu.Lock()
	previous := cloneUpdateInfo(s.info)
	s.info.State = UpdateChecking
	s.info.Progress = nil
	s.info.Reason = nil
	checking := updateEvent(s.info)
	s.mu.Unlock()
	s.emit(EventUpdatesState, checking)

	ctx := context.Background()
	if s.context != nil {
		if appContext := s.context(); appContext != nil {
			ctx = appContext
		}
	}

	s.mu.RLock()
	config := s.config
	cached := append([]updater.Release(nil), s.releases...)
	s.mu.RUnlock()
	releases, etag, notModified, fetchErr := updater.FetchReleases(ctx, config, preferences.Updates.ETag)
	if fetchErr == nil && notModified {
		if len(cached) == 0 {
			releases, etag, _, fetchErr = updater.FetchReleases(ctx, config, "")
		} else {
			releases = cached
		}
	}
	if fetchErr != nil {
		return s.finishCheckError(previous, manual, fetchErr)
	}

	checkedAt := s.now().UTC().Format(time.RFC3339)
	preferences, err = s.preferences.Update(func(preferences *appwin.Preferences) error {
		preferences.Updates.ETag = etag
		preferences.Updates.LastCheck = checkedAt
		return nil
	})
	if err != nil {
		return s.finishCheckError(previous, manual, err)
	}
	choice := updater.Pick(releases, s.current, preferences.Updates.Prerelease, s.install, s.goos, s.goarch)

	s.mu.Lock()
	s.releases = append(s.releases[:0], releases...)
	s.choice = choice
	s.info.CheckedAt = checkedAt
	s.applyChoiceLocked(choice)
	event := updateEvent(s.info)
	s.mu.Unlock()
	s.emit(EventUpdatesState, event)
	return s.Info()
}

func (s *UpdateService) Remind() error {
	_, err := s.preferences.Update(func(preferences *appwin.Preferences) error {
		preferences.Updates.RemindAfter = s.now().UTC().Add(24 * time.Hour).Format(time.RFC3339)
		return nil
	})
	if err != nil {
		return clean(err)
	}
	return nil
}

func (s *UpdateService) Skip(version string) error {
	s.mu.RLock()
	latest := ""
	if s.info.Latest != nil {
		latest = *s.info.Latest
	}
	s.mu.RUnlock()
	if version == "" || version != latest {
		return apperr.New(apperr.InvalidInput)
	}
	_, err := s.preferences.Update(func(preferences *appwin.Preferences) error {
		preferences.Updates.Skipped = version
		preferences.Updates.RemindAfter = ""
		return nil
	})
	if err != nil {
		return clean(err)
	}
	return nil
}

func (s *UpdateService) Prefs() (UpdatePrefs, error) {
	preferences, err := s.preferences.Get()
	if err != nil {
		return UpdatePrefs{}, clean(err)
	}
	return UpdatePrefs{Auto: preferences.Updates.Auto, Prerelease: preferences.Updates.Prerelease}, nil
}

func (s *UpdateService) SetPrefs(value UpdatePrefs) (UpdatePrefs, error) {
	s.checkMu.Lock()
	defer s.checkMu.Unlock()
	_, err := s.preferences.Update(func(preferences *appwin.Preferences) error {
		preferences.Updates.Auto = value.Auto
		preferences.Updates.Prerelease = value.Prerelease
		return nil
	})
	if err != nil {
		return UpdatePrefs{}, clean(err)
	}

	s.mu.Lock()
	if len(s.releases) > 0 {
		s.choice = updater.Pick(s.releases, s.current, value.Prerelease, s.install, s.goos, s.goarch)
		s.applyChoiceLocked(s.choice)
	}
	event := updateEvent(s.info)
	s.mu.Unlock()
	s.emit(EventUpdatesState, event)
	return value, nil
}

func (s *UpdateService) Download() error {
	s.mu.Lock()
	if s.stopping || s.choice == nil || s.downloadCancel != nil || (s.info.State != UpdateAvailable && s.info.State != UpdateFailed) {
		s.mu.Unlock()
		return apperr.New(apperr.InvalidInput)
	}
	choice := *s.choice
	config := s.config
	ctx := context.Background()
	if s.context != nil {
		if appContext := s.context(); appContext != nil {
			ctx = appContext
		}
	}
	ctx, cancel := context.WithCancel(ctx)
	s.downloadCancel = cancel
	s.ready = nil
	s.info.State = UpdateDownloading
	s.info.Reason = nil
	s.info.Progress = &UpdateProgress{Total: choice.Package.Size}
	event := updateEvent(s.info)
	s.worker.Add(1)
	s.mu.Unlock()
	s.emit(EventUpdatesState, event)
	go s.runDownload(ctx, choice, config)
	return nil
}

func (s *UpdateService) Cancel() error {
	s.mu.RLock()
	cancel := s.downloadCancel
	s.mu.RUnlock()
	if cancel == nil {
		return apperr.New(apperr.InvalidInput)
	}
	cancel()
	return nil
}

func (s *UpdateService) RestartNow() error {
	helper, manifest, err := s.prepareApply()
	if err != nil {
		return clean(err)
	}
	if err := s.launchHelper(helper, manifest); err != nil {
		return clean(err)
	}
	s.mu.Lock()
	s.pendingHelper, s.pendingManifest = "", ""
	s.info.State = UpdateApplying
	event := updateEvent(s.info)
	s.mu.Unlock()
	s.emit(EventUpdatesState, event)
	if s.quit != nil {
		s.quit()
	}
	return nil
}

func (s *UpdateService) ApplyOnQuit() error {
	helper, manifest, err := s.prepareApply()
	if err != nil {
		return clean(err)
	}
	s.mu.Lock()
	s.pendingHelper = helper
	s.pendingManifest = manifest
	s.mu.Unlock()
	return nil
}

func (s *UpdateService) OpenDownloadFolder() error {
	s.mu.RLock()
	ready := s.ready
	s.mu.RUnlock()
	if ready == nil {
		return apperr.New(apperr.InvalidInput)
	}
	return clean(s.openFolder(filepath.Dir(ready.packagePath)))
}

func (s *UpdateService) LastResult() (*UpdateResult, error) {
	result, err := updater.ConsumeLastResult(s.dataDir)
	if err != nil {
		return nil, clean(err)
	}
	if result == nil {
		return nil, nil
	}
	if result.Status == "ok" {
		_ = updater.CleanupOldVersions(filepath.Join(s.dataDir, "updates"), result.Version)
	}
	converted := &UpdateResult{Version: result.Version, Status: result.Status}
	if result.Reason != "" {
		reason := UpdateFailure(result.Reason)
		converted.Reason = &reason
	}
	return converted, nil
}

func (s *UpdateService) start(parent context.Context) {
	s.mu.Lock()
	if s.cancel != nil {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	s.cancel = cancel
	interval := s.checkInterval
	s.worker.Add(1)
	s.mu.Unlock()
	go func() {
		defer s.worker.Done()
		_, _ = s.Check(false)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				_, _ = s.Check(false)
			case <-ctx.Done():
				return
			}
		}
	}()
}

func (s *UpdateService) stop() {
	s.mu.Lock()
	s.stopping = true
	cancel := s.cancel
	downloadCancel := s.downloadCancel
	s.cancel = nil
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if downloadCancel != nil {
		downloadCancel()
	}
	s.worker.Wait()
}

func (s *UpdateService) launchPendingOnShutdown() {
	s.mu.Lock()
	helper, manifest := s.pendingHelper, s.pendingManifest
	s.pendingHelper, s.pendingManifest = "", ""
	s.mu.Unlock()
	if helper != "" && manifest != "" {
		_ = s.launchHelper(helper, manifest)
	}
}

func (s *UpdateService) runDownload(ctx context.Context, choice updater.Choice, config updater.Config) {
	defer s.worker.Done()
	directory := filepath.Join(s.dataDir, "updates", choice.Version)
	progress := func(value updater.Progress) {
		s.mu.Lock()
		if s.info.State == UpdateDownloading {
			copy := UpdateProgress(value)
			s.info.Progress = &copy
			event := updateEvent(s.info)
			s.mu.Unlock()
			s.emit(EventUpdatesState, event)
			return
		}
		s.mu.Unlock()
	}
	packagePath, err := updater.Download(ctx, config, choice.Package, directory, progress)
	var sumsPath, signaturePath string
	if err == nil {
		if choice.Checksums.Name != "SHA256SUMS.txt" || choice.Checksums.Size > 4<<20 || choice.Signature.Name != "SHA256SUMS.txt.sig" || choice.Signature.Size > 4<<10 {
			err = updater.ErrSignature
		} else {
			sumsPath, err = updater.Download(ctx, config, choice.Checksums, directory, nil)
		}
	}
	if err == nil {
		signaturePath, err = updater.Download(ctx, config, choice.Signature, directory, nil)
	}
	if err == nil {
		s.mu.Lock()
		s.info.State = UpdateVerifying
		s.info.Progress = nil
		event := updateEvent(s.info)
		s.mu.Unlock()
		s.emit(EventUpdatesState, event)
		err = verifyDownloadedFiles(packagePath, sumsPath, signaturePath, choice.Package.Name, config.PublicKey)
	}
	if err != nil && (errors.Is(err, updater.ErrSignature) || errors.Is(err, updater.ErrChecksum)) {
		_ = os.Remove(packagePath)
	}
	s.finishDownload(ctx, choice.Version, packagePath, sumsPath, signaturePath, err)
}

func (s *UpdateService) finishDownload(ctx context.Context, version, packagePath, sumsPath, signaturePath string, err error) {
	wasCanceled := errors.Is(err, context.Canceled) || ctx.Err() != nil
	s.mu.Lock()
	cancel := s.downloadCancel
	s.downloadCancel = nil
	s.info.Progress = nil
	if wasCanceled {
		s.info.State = UpdateAvailable
		s.info.Reason = nil
		s.ready = nil
	} else if err != nil {
		reason := updateDownloadFailure(err)
		s.info.State = UpdateFailed
		s.info.Reason = &reason
		s.ready = nil
	} else {
		s.info.State = UpdateReady
		s.info.Reason = nil
		s.ready = &readyUpdate{version: version, packagePath: packagePath, checksums: sumsPath, signature: signaturePath}
	}
	event := updateEvent(s.info)
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	s.emit(EventUpdatesState, event)
}

func verifyDownloadedFiles(packagePath, sumsPath, signaturePath, name string, publicKey []byte) error {
	sums, err := os.ReadFile(sumsPath)
	if err != nil {
		return updater.ErrChecksum
	}
	signature, err := os.ReadFile(signaturePath)
	if err != nil {
		return updater.ErrSignature
	}
	file, err := os.Open(packagePath)
	if err != nil {
		return updater.ErrChecksum
	}
	defer file.Close()
	return updater.Verify(sums, signature, publicKey, name, file)
}

func updateDownloadFailure(err error) UpdateFailure {
	switch {
	case errors.Is(err, updater.ErrDiskSpace):
		return UpdateFailureDiskSpace
	case errors.Is(err, updater.ErrSignature):
		return UpdateFailureSignature
	case errors.Is(err, updater.ErrChecksum), errors.Is(err, updater.ErrSize):
		return UpdateFailureChecksum
	case errors.Is(err, os.ErrPermission):
		return UpdateFailurePermission
	default:
		return UpdateFailureNetwork
	}
}

func (s *UpdateService) prepareApply() (string, string, error) {
	s.mu.RLock()
	if s.info.State != UpdateReady || s.ready == nil {
		s.mu.RUnlock()
		return "", "", apperr.New(apperr.InvalidInput)
	}
	ready := *s.ready
	install := s.install
	oneClick := s.info.OneClick
	s.mu.RUnlock()
	if !oneClick || install.Target == "" {
		return "", "", apperr.New(apperr.InvalidInput)
	}
	executable, err := os.Executable()
	if err != nil {
		return "", "", err
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return "", "", err
	}
	helperName := "OpenHost-update-helper"
	if runtime.GOOS == "windows" {
		helperName += ".exe"
	}
	helper := filepath.Join(filepath.Dir(ready.packagePath), helperName)
	_ = os.Remove(helper)
	if err := copyUpdateHelper(executable, helper); err != nil {
		return "", "", err
	}
	manifestPath := filepath.Join(filepath.Dir(ready.packagePath), "apply.json")
	manifest := updater.ApplyManifest{PID: os.Getpid(), Version: ready.version, Install: install.Kind,
		PackagePath: ready.packagePath, TargetPath: install.Target, Relaunch: append([]string{executable}, os.Args[1:]...)}
	if err := updater.WriteApplyManifest(manifestPath, manifest); err != nil {
		return "", "", err
	}
	return helper, manifestPath, nil
}

func copyUpdateHelper(source, target string) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	info, err := input.Stat()
	if err != nil {
		return err
	}
	output, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(output, input)
	if copyErr == nil {
		copyErr = output.Sync()
	}
	closeErr := output.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func (s *UpdateService) finishCheckError(previous UpdateInfo, manual bool, cause error) (UpdateInfo, error) {
	if !manual {
		s.mu.Lock()
		s.info = previous
		event := updateEvent(s.info)
		s.mu.Unlock()
		s.emit(EventUpdatesState, event)
		return s.Info()
	}
	reason := UpdateFailureNetwork
	s.mu.Lock()
	s.info.State = UpdateFailed
	s.info.Progress = nil
	s.info.Reason = &reason
	event := updateEvent(s.info)
	s.mu.Unlock()
	s.emit(EventUpdatesState, event)
	if errors.Is(cause, updater.ErrRateLimited) {
		return UpdateInfo{}, updateCheckError(apperr.RateLimited)
	}
	return UpdateInfo{}, updateCheckError(apperr.Network)
}

func (s *UpdateService) applyChoiceLocked(choice *updater.Choice) {
	installName, oneClick, command := updateInstallPresentation(s.install)
	s.info.Install = installName
	s.info.OneClick = oneClick
	s.info.ManualCommand = command
	s.info.Progress = nil
	s.info.Reason = nil
	if choice == nil {
		s.info.Latest = nil
		s.info.Prerelease = false
		s.info.Notes = ""
		s.info.State = UpdateUpToDate
		return
	}
	latest := choice.Version
	s.info.Latest = &latest
	s.info.Prerelease = choice.Prerelease
	s.info.Notes = choice.Notes
	s.info.State = UpdateAvailable
	if s.install.Kind == updater.InstallDEB {
		command := "sudo apt install ./openhost_" + choice.Version + "_" + s.goarch + ".deb"
		s.info.ManualCommand = &command
	}
	if s.install.Kind == updater.InstallRPM {
		arch := map[string]string{"amd64": "x86_64", "arm64": "aarch64"}[s.goarch]
		command := "sudo dnf install ./openhost-" + choice.Version + "-1." + arch + ".rpm"
		s.info.ManualCommand = &command
	}
}

func updateInstallPresentation(install updater.Install) (string, bool, *string) {
	name := string(install.Kind)
	switch install.Kind {
	case updater.InstallAppReadonly:
		name = "app"
	case updater.InstallUnmanaged:
		name = "manual"
	}
	oneClick := install.Writable && (install.Kind == updater.InstallNSIS || install.Kind == updater.InstallApp || install.Kind == updater.InstallAppImage)
	command := strings.TrimSpace(install.ManualCommand)
	if command == "" {
		return name, oneClick, nil
	}
	return name, oneClick, &command
}

func updateCheckError(code apperr.Code) error {
	return &apperr.Error{Code: code, Message: apperr.Messages[code], Op: "UpdateService.Check"}
}

func cloneUpdateInfo(value UpdateInfo) UpdateInfo {
	result := value
	if value.Latest != nil {
		latest := *value.Latest
		result.Latest = &latest
	}
	if value.ManualCommand != nil {
		command := *value.ManualCommand
		result.ManualCommand = &command
	}
	if value.Progress != nil {
		progress := *value.Progress
		result.Progress = &progress
	}
	if value.Reason != nil {
		reason := *value.Reason
		result.Reason = &reason
	}
	return result
}

func updateEvent(info UpdateInfo) UpdateStateEvent {
	event := UpdateStateEvent{State: info.State, Progress: info.Progress, Reason: info.Reason}
	if info.Latest != nil {
		event.Version = *info.Latest
	}
	return event
}

func shouldNotify(latest *string, preferences appwin.UpdatePrefs, now time.Time) bool {
	if latest == nil || *latest == "" || preferences.Skipped == *latest {
		return false
	}
	if preferences.RemindAfter == "" {
		return true
	}
	remindAfter, err := time.Parse(time.RFC3339Nano, preferences.RemindAfter)
	return err != nil || !now.Before(remindAfter)
}

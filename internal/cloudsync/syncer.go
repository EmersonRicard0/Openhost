package cloudsync

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"sync"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/vault"
)

type SyncState string

const (
	SyncStateOff           SyncState = "off"
	SyncStateSyncing       SyncState = "syncing"
	SyncStateSynced        SyncState = "synced"
	SyncStatePending       SyncState = "pending"
	SyncStateConflict      SyncState = "conflict"
	SyncStateNeedsPassword SyncState = "needsPassword"
	SyncStateError         SyncState = "error"
	SyncStateLocked        SyncState = "locked"
)

type SyncFailure string

const (
	SyncFailureAuth    SyncFailure = "auth"
	SyncFailureQuota   SyncFailure = "quota"
	SyncFailureFormat  SyncFailure = "format"
	SyncFailureRemoved SyncFailure = "removed"
	SyncFailureCorrupt SyncFailure = "corrupt"
)

type SyncInfo struct {
	State      SyncState    `json:"state"`
	Available  bool         `json:"available"`
	Email      *string      `json:"email"`
	DeviceName *string      `json:"deviceName"`
	LastSync   *string      `json:"lastSync"`
	Pending    int          `json:"pending"`
	Conflicts  int          `json:"conflicts"`
	Reason     *SyncFailure `json:"reason"`
}

type SyncAccount struct {
	Email        string `json:"email"`
	RefreshToken string `json:"refreshToken"`
	ConnectedAt  string `json:"connectedAt"`
}

type syncItemState struct {
	VV        VersionVector `json:"vv"`
	Hash      string        `json:"hash"`
	Deleted   bool          `json:"deleted"`
	DeletedAt string        `json:"deletedAt,omitempty"`
}

type persistentSyncState struct {
	Account     SyncAccount              `json:"account"`
	DeviceID    string                   `json:"deviceId"`
	DeviceName  string                   `json:"deviceName"`
	Epoch       int                      `json:"epoch"`
	EpochKeys   map[int][]byte           `json:"epochKeys,omitempty"`
	Lamport     uint64                   `json:"lamport"`
	Base        string                   `json:"base"`
	Items       map[string]syncItemState `json:"items"`
	Conflicts   []Conflict               `json:"conflicts"`
	Dirty       bool                     `json:"dirty"`
	ForceUpload bool                     `json:"forceUpload,omitempty"`
	LastSync    string                   `json:"lastSync,omitempty"`
}

type DriveFactory func(context.Context, string) *Drive

type syncerOptions struct {
	Debounce   time.Duration
	Poll       time.Duration
	Retry      []time.Duration
	Now        func() time.Time
	DeviceName func() string
}

func defaultSyncerOptions() syncerOptions {
	return syncerOptions{Debounce: 3 * time.Second, Poll: time.Minute,
		Retry: []time.Duration{5 * time.Second, 15 * time.Second, time.Minute, 5 * time.Minute}, Now: time.Now,
		DeviceName: func() string {
			name, _ := os.Hostname()
			if !validDeviceName(name) {
				return "Este computador"
			}
			return name
		}}
}

type Syncer struct {
	store        *vault.Store
	preferences  *appwin.PreferenceStore
	driveFactory DriveFactory
	emit         func(SyncInfo)
	options      syncerOptions

	mu             sync.Mutex
	info           SyncInfo
	state          persistentSyncState
	drive          *Drive
	loaded         bool
	listedVersions map[string]DriveFile
	activeCancel   context.CancelFunc
	opMu           sync.Mutex
	change         chan struct{}
	status         chan vault.Status
	stop           chan struct{}
	done           chan struct{}
}

func NewSyncer(store *vault.Store, preferences *appwin.PreferenceStore, driveFactory DriveFactory, emit func(SyncInfo)) *Syncer {
	return newSyncer(store, preferences, driveFactory, emit, defaultSyncerOptions())
}

func newSyncer(store *vault.Store, preferences *appwin.PreferenceStore, factory DriveFactory, emit func(SyncInfo), options syncerOptions) *Syncer {
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.DeviceName == nil {
		options.DeviceName = func() string { return "Este computador" }
	}
	if options.Debounce <= 0 {
		options.Debounce = 3 * time.Second
	}
	if options.Poll <= 0 {
		options.Poll = time.Minute
	}
	if len(options.Retry) == 0 {
		options.Retry = []time.Duration{5 * time.Second, 15 * time.Second, time.Minute, 5 * time.Minute}
	}
	s := &Syncer{store: store, preferences: preferences, driveFactory: factory, emit: emit, options: options,
		change: make(chan struct{}, 1), status: make(chan vault.Status, 1), stop: make(chan struct{}), done: make(chan struct{})}
	s.info = SyncInfo{State: SyncStateOff, Available: Available()}
	store.OnChange(s.localChanged)
	store.OnStatus(func(status vault.Status) {
		if status.State != vault.StateUnlocked {
			s.cancelActive()
			s.mu.Lock()
			zeroKeys(s.state.EpochKeys)
			s.state.EpochKeys = nil
			s.mu.Unlock()
		}
		select {
		case s.status <- status:
		default:
		}
	})
	if store.Status().State == vault.StateUnlocked {
		_ = s.resume(context.Background())
	}
	go s.loop()
	return s
}

func (s *Syncer) Close() {
	select {
	case <-s.stop:
		return
	default:
		s.cancelActive()
		close(s.stop)
		<-s.done
		s.mu.Lock()
		zeroKeys(s.state.EpochKeys)
		s.state.EpochKeys = nil
		s.mu.Unlock()
	}
}

func (s *Syncer) Info() SyncInfo {
	s.mu.Lock()
	defer s.mu.Unlock()
	info := cloneSyncInfo(s.info)
	info.Available = Available() || s.loaded
	return info
}

func (s *Syncer) StartUpload(ctx context.Context, account SyncAccount, drive *Drive) error {
	if drive == nil || !validOAuthEmail(account.Email) || account.RefreshToken == "" || s.store.Status().State != vault.StateUnlocked {
		return apperr.New(apperr.InvalidInput)
	}
	files, err := drive.List(ctx, KeyringFiles, 2)
	if err != nil {
		return err
	}
	if len(files) != 0 {
		return apperr.New(apperr.InvalidInput)
	}
	material, err := s.store.SyncKeyMaterial()
	if err != nil {
		return err
	}
	defer vault.Zero(material.DEK)
	defer vault.Zero(material.KEK)
	keyring, err := SealKeyringWithKEK(material.KEK, material.KDF, 1, map[int][]byte{1: material.DEK})
	if err != nil {
		return err
	}
	created, err := drive.Create(ctx, "keyring.json", keyring, nil)
	if err != nil {
		return err
	}
	deviceID, err := newDeviceID()
	if err != nil {
		_ = drive.Delete(ctx, created.ID)
		return apperr.New(apperr.Internal)
	}
	deviceName := s.options.DeviceName()
	if !validDeviceName(deviceName) {
		deviceName = "Este computador"
	}
	if account.ConnectedAt == "" {
		account.ConnectedAt = s.nowString()
	}
	state := persistentSyncState{Account: account, DeviceID: deviceID, DeviceName: deviceName, Epoch: 1,
		EpochKeys: map[int][]byte{1: append([]byte(nil), material.DEK...)},
		Items:     map[string]syncItemState{}, Conflicts: []Conflict{}, Dirty: true}
	if err := s.saveState(state); err != nil {
		_ = drive.Delete(ctx, created.ID)
		return err
	}
	s.mu.Lock()
	s.state, s.drive, s.loaded = state, drive, true
	s.mu.Unlock()
	return s.sync(ctx)
}

func (s *Syncer) SyncNow(ctx context.Context) error { return s.sync(ctx) }

func (s *Syncer) SetDeviceName(name string) error {
	if !validDeviceName(name) {
		return apperr.New(apperr.InvalidInput)
	}
	s.mu.Lock()
	if !s.loaded {
		s.mu.Unlock()
		return apperr.New(apperr.NotFound)
	}
	s.state.DeviceName, s.state.Dirty = name, true
	state := s.state
	s.mu.Unlock()
	if err := s.saveState(state); err != nil {
		return err
	}
	s.updateInfo(SyncStatePending, 1, nil)
	s.signal()
	return nil
}

func (s *Syncer) localChanged() {
	if s.store.Status().State != vault.StateUnlocked {
		return
	}
	s.mu.Lock()
	if !s.loaded {
		s.mu.Unlock()
		return
	}
	s.state.Dirty = true
	state := s.state
	s.mu.Unlock()
	_ = s.saveState(state)
	s.updateInfo(SyncStatePending, 1, nil)
	s.signal()
}

func (s *Syncer) signal() {
	select {
	case s.change <- struct{}{}:
	default:
	}
}

func (s *Syncer) loop() {
	defer close(s.done)
	poll := time.NewTicker(s.options.Poll)
	defer poll.Stop()
	var timer *time.Timer
	var timerC <-chan time.Time
	retry := 0
	reset := func(after time.Duration) {
		if timer == nil {
			timer = time.NewTimer(after)
		} else {
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			timer.Reset(after)
		}
		timerC = timer.C
	}
	for {
		select {
		case <-s.stop:
			if timer != nil {
				timer.Stop()
			}
			return
		case status := <-s.status:
			if status.State == vault.StateUnlocked {
				if s.resume(context.Background()) == nil {
					reset(0)
				}
			} else if s.isLoaded() {
				s.updateInfo(SyncStateLocked, 0, nil)
			}
		case <-s.change:
			reset(s.options.Debounce)
		case <-poll.C:
			if s.canSync() {
				reset(0)
			}
		case <-timerC:
			timerC = nil
			if !s.canSync() {
				continue
			}
			if err := s.sync(context.Background()); err != nil {
				reset(s.options.Retry[min(retry, len(s.options.Retry)-1)])
				if retry < len(s.options.Retry)-1 {
					retry++
				}
			} else {
				retry = 0
			}
		}
	}
}

func (s *Syncer) isLoaded() bool { s.mu.Lock(); defer s.mu.Unlock(); return s.loaded }
func (s *Syncer) canSync() bool  { return s.store.Status().State == vault.StateUnlocked && s.isLoaded() }

func (s *Syncer) resume(ctx context.Context) error {
	raw, err := s.store.SyncState()
	if err != nil || len(raw) == 0 {
		return err
	}
	var state persistentSyncState
	if decodeStrict(raw, &state) != nil || !validPersistentState(state) {
		return apperr.New(apperr.VaultUnreadable)
	}
	s.mu.Lock()
	refreshDrive := !s.loaded || s.state.Account.RefreshToken != state.Account.RefreshToken
	oldKeys := s.state.EpochKeys
	s.state, s.loaded = state, true
	if refreshDrive && s.driveFactory != nil {
		s.drive = s.driveFactory(ctx, state.Account.RefreshToken)
	}
	s.mu.Unlock()
	zeroKeys(oldKeys)
	phase, pending := SyncStateSynced, 0
	if state.Dirty {
		phase, pending = SyncStatePending, 1
	}
	s.updateInfo(phase, pending, nil)
	return nil
}

func (s *Syncer) sync(ctx context.Context) error {
	s.opMu.Lock()
	defer s.opMu.Unlock()
	ctx, cancel := context.WithCancel(ctx)
	s.mu.Lock()
	s.activeCancel = cancel
	s.mu.Unlock()
	defer func() {
		cancel()
		s.mu.Lock()
		s.activeCancel = nil
		s.mu.Unlock()
	}()
	if s.store.Status().State != vault.StateUnlocked {
		return apperr.New(apperr.VaultLocked)
	}
	s.mu.Lock()
	state, drive, loaded := s.state, s.drive, s.loaded
	s.mu.Unlock()
	if !loaded || drive == nil {
		return apperr.New(apperr.NotFound)
	}
	s.updateInfo(SyncStateSyncing, 0, nil)
	remoteFiles, err := drive.List(ctx, SnapshotFiles, 1)
	if err != nil {
		s.failed(err)
		return err
	}
	local, changed, pending, err := s.localVersions(&state)
	if err != nil {
		s.failed(err)
		return err
	}
	needUpload := changed || state.ForceUpload || state.Base == ""
	uploaded := false
	if len(remoteFiles) == 0 && state.Base != "" {
		reason := SyncFailureRemoved
		s.updateInfo(SyncStateError, 0, &reason)
		return nil
	}
	if len(remoteFiles) != 0 && remoteFiles[0].Name != state.Base {
		bytes, err := drive.Get(ctx, remoteFiles[0].ID)
		if err != nil {
			s.failed(err)
			return err
		}
		material, err := s.store.SyncKeyMaterial()
		if err != nil {
			s.failed(err)
			return err
		}
		keys := cloneEpochKeys(state.EpochKeys)
		keys[state.Epoch] = append([]byte(nil), material.DEK...)
		header, remote, openErr := OpenSnapshot(bytes, keys)
		zeroKeys(keys)
		vault.Zero(material.DEK)
		vault.Zero(material.KEK)
		if openErr != nil {
			if errors.Is(openErr, ErrMissingEpoch) && header.Epoch > state.Epoch {
				s.updateInfo(SyncStateNeedsPassword, 0, nil)
				return nil
			}
			s.failed(openErr)
			return openErr
		}
		if header.Lamport > state.Lamport {
			state.Lamport = header.Lamport
		}
		merged, err := Merge(local, remote.Items, s.options.Now().UTC())
		if err != nil {
			s.failed(err)
			return err
		}
		if err := s.applyVersions(merged.Items); err != nil {
			s.failed(err)
			return err
		}
		needUpload = needUpload || !sameVersions(merged.Items, remote.Items)
		local, state.Base = merged.Items, remoteFiles[0].Name
		state.Conflicts = reconcileConflicts(state.Conflicts, merged.Conflicts, merged.Items)
	}
	state.Items = itemStates(local)
	if needUpload {
		state.Lamport++
		material, err := s.store.SyncKeyMaterial()
		if err != nil {
			s.failed(err)
			return err
		}
		sealed, sealErr := SealSnapshot(state.Epoch, state.Lamport, state.DeviceID, material.DEK,
			SnapshotBody{DeviceName: state.DeviceName, CreatedAt: s.nowString(), Items: local})
		vault.Zero(material.DEK)
		vault.Zero(material.KEK)
		if sealErr != nil {
			s.failed(sealErr)
			return sealErr
		}
		if s.store.Status().State != vault.StateUnlocked {
			return apperr.New(apperr.VaultLocked)
		}
		name := fmt.Sprintf("snap-%012d-%s.ohs", state.Lamport, state.DeviceID)
		if _, err := drive.Create(ctx, name, sealed, map[string]string{"lamport": fmt.Sprint(state.Lamport), "deviceId": state.DeviceID}); err != nil {
			s.failed(err)
			return err
		}
		state.Base = name
		uploaded = true
	}
	state.Dirty, state.ForceUpload, state.LastSync = false, false, s.nowString()
	if err := s.saveState(state); err != nil {
		s.failed(err)
		return err
	}
	s.mu.Lock()
	s.state = state
	s.mu.Unlock()
	if uploaded {
		if err := s.pruneSnapshots(ctx, drive); err != nil {
			s.failed(err)
			return err
		}
	}
	if len(state.Conflicts) != 0 {
		s.updateInfo(SyncStateConflict, pending, nil)
	} else {
		s.updateInfo(SyncStateSynced, 0, nil)
	}
	return nil
}

func (s *Syncer) cancelActive() {
	s.mu.Lock()
	cancel := s.activeCancel
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *Syncer) localVersions(state *persistentSyncState) ([]ItemVersion, bool, int, error) {
	content, err := s.store.Read()
	if err != nil {
		return nil, false, 0, err
	}
	profiles, err := s.store.TerminalProfiles()
	if err != nil {
		return nil, false, 0, err
	}
	schemes, err := s.store.ColorSchemes()
	if err != nil {
		return nil, false, 0, err
	}
	prefs, err := s.preferences.Get()
	if err != nil {
		return nil, false, 0, err
	}
	plain, err := EncodeItems(SyncData{Content: content, Profiles: profiles, Schemes: schemes, Preferences: SyncPreferencesFrom(prefs)})
	if err != nil {
		return nil, false, 0, err
	}
	current := map[string]PlainItem{}
	for _, item := range plain {
		current[item.Key] = item
	}
	keys, seen := make([]string, 0, len(current)+len(state.Items)), map[string]bool{}
	for key := range current {
		keys = append(keys, key)
		seen[key] = true
	}
	for key := range state.Items {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	versions := make([]ItemVersion, 0, len(keys))
	changed := 0
	counter := state.Lamport + 1
	for _, key := range keys {
		item, exists := current[key]
		old, known := state.Items[key]
		vv := cloneVector(old.VV)
		if !known {
			vv = VersionVector{}
		}
		if exists {
			if !known || old.Deleted || old.Hash != item.Hash {
				vv[state.DeviceID] = max(vv[state.DeviceID]+1, counter)
				changed++
			}
			versions = append(versions, ItemVersion{Key: key, VV: vv, Data: append(json.RawMessage(nil), item.Data...)})
			continue
		}
		if old.Deleted {
			versions = append(versions, ItemVersion{Key: key, VV: vv, Deleted: true, DeletedAt: old.DeletedAt})
			continue
		}
		vv[state.DeviceID] = max(vv[state.DeviceID]+1, counter)
		versions = append(versions, ItemVersion{Key: key, VV: vv, Deleted: true, DeletedAt: s.nowString()})
		changed++
	}
	return versions, changed != 0, changed, nil
}

func (s *Syncer) applyVersions(items []ItemVersion) error {
	plain := make([]PlainItem, 0, len(items))
	for _, item := range items {
		if !item.Deleted {
			plain = append(plain, PlainItem{Key: item.Key, Hash: StableItemHash(item.Data), Data: append(json.RawMessage(nil), item.Data...)})
		}
	}
	data, rejected, err := DecodeItems(plain)
	if err != nil || len(rejected) != 0 {
		return apperr.New(apperr.CloudCorrupt)
	}
	base, err := s.preferences.Get()
	if err != nil {
		return err
	}
	return s.store.ApplySynchronized(data.Content, data.Profiles, data.Schemes, "preferences", ApplySyncPreferences(base, data.Preferences))
}

func (s *Syncer) failed(err error) {
	phase := SyncStateError
	var reason *SyncFailure
	switch apperr.CodeOf(err) {
	case apperr.Network, apperr.ConnectTimeout, apperr.ConnectRefused, apperr.HostUnreachable:
		phase = SyncStatePending
	case apperr.SyncAuth:
		value := SyncFailureAuth
		reason = &value
	case apperr.SyncQuota:
		value := SyncFailureQuota
		reason = &value
	case apperr.SyncFormat:
		value := SyncFailureFormat
		reason = &value
	case apperr.CloudCorrupt:
		value := SyncFailureCorrupt
		reason = &value
	}
	s.updateInfo(phase, 1, reason)
}

func (s *Syncer) updateInfo(phase SyncState, pending int, reason *SyncFailure) {
	s.mu.Lock()
	info := SyncInfo{State: phase, Available: Available() || s.loaded, Pending: pending, Reason: reason}
	if s.loaded {
		info.Email = stringPtr(s.state.Account.Email)
		info.DeviceName = stringPtr(s.state.DeviceName)
		info.Conflicts = len(s.state.Conflicts)
		if s.state.LastSync != "" {
			info.LastSync = stringPtr(s.state.LastSync)
		}
	}
	s.info = info
	emit := s.emit
	s.mu.Unlock()
	if emit != nil {
		emit(cloneSyncInfo(info))
	}
}

func (s *Syncer) saveState(state persistentSyncState) error {
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	defer vault.Zero(raw)
	return s.store.SetSyncState(raw)
}
func (s *Syncer) nowString() string { return s.options.Now().UTC().Format(time.RFC3339Nano) }
func validPersistentState(state persistentSyncState) bool {
	if !validOAuthEmail(state.Account.Email) || state.Account.RefreshToken == "" || !deviceIDPattern.MatchString(state.DeviceID) || !validDeviceName(state.DeviceName) || state.Epoch < 1 || state.Items == nil || state.Conflicts == nil {
		return false
	}
	for epoch, key := range state.EpochKeys {
		if epoch < 1 || epoch > state.Epoch || len(key) != vault.KeySize {
			return false
		}
	}
	return true
}
func newDeviceID() (string, error) {
	var raw [8]byte
	_, err := rand.Read(raw[:])
	return hex.EncodeToString(raw[:]), err
}
func cloneVector(value VersionVector) VersionVector {
	result := make(VersionVector, len(value))
	for key, n := range value {
		result[key] = n
	}
	return result
}
func cloneEpochKeys(value map[int][]byte) map[int][]byte {
	result := make(map[int][]byte, len(value))
	for epoch, key := range value {
		result[epoch] = append([]byte(nil), key...)
	}
	return result
}
func itemStates(items []ItemVersion) map[string]syncItemState {
	result := make(map[string]syncItemState, len(items))
	for _, item := range items {
		result[item.Key] = syncItemState{VV: cloneVector(item.VV), Hash: versionHash(item), Deleted: item.Deleted, DeletedAt: item.DeletedAt}
	}
	return result
}
func sameVersions(a, b []ItemVersion) bool {
	if len(a) != len(b) {
		return false
	}
	left, e1 := indexVersions(a)
	right, e2 := indexVersions(b)
	if e1 != nil || e2 != nil {
		return false
	}
	for key, item := range left {
		other, ok := right[key]
		if !ok || compareVectors(item.VV, other.VV) != vectorsEqual || versionHash(item) != versionHash(other) {
			return false
		}
	}
	return true
}
func stringPtr(value string) *string { return &value }
func cloneSyncInfo(value SyncInfo) SyncInfo {
	if value.Email != nil {
		value.Email = stringPtr(*value.Email)
	}
	if value.DeviceName != nil {
		value.DeviceName = stringPtr(*value.DeviceName)
	}
	if value.LastSync != nil {
		value.LastSync = stringPtr(*value.LastSync)
	}
	if value.Reason != nil {
		reason := *value.Reason
		value.Reason = &reason
	}
	return value
}

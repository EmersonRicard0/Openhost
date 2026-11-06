package cloudsync

import (
	"context"
	"testing"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/cloudsync/drivefake"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

const syncTestPassword = "senha-sync-segura"

func TestSyncerUploadsKeyringAndOnlySyncableChanges(t *testing.T) {
	store, preferences := syncTestStore(t)
	fake := drivefake.New()
	defer fake.Close()
	drive := newDrive(fake.URL(), fake.Client())
	syncer := newSyncer(store, preferences, nil, nil, syncerOptions{Debounce: 20 * time.Millisecond, Poll: time.Hour,
		Retry: []time.Duration{20 * time.Millisecond}, Now: time.Now, DeviceName: func() string { return "Computador teste" }})
	defer syncer.Close()
	if err := syncer.StartUpload(context.Background(), SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh"}, drive); err != nil {
		t.Fatal(err)
	}
	if info := syncer.Info(); info.State != SyncStateSynced || info.Email == nil || *info.Email != "usuario@example.com" || info.LastSync == nil {
		t.Fatalf("estado inicial = %+v", info)
	}
	keyrings, _ := drive.List(context.Background(), KeyringFiles, 10)
	snapshots, _ := drive.List(context.Background(), SnapshotFiles, 10)
	if len(keyrings) != 1 || len(snapshots) != 1 {
		t.Fatalf("arquivos iniciais: keyring=%d snapshots=%d", len(keyrings), len(snapshots))
	}
	keyringBytes, _ := drive.Get(context.Background(), keyrings[0].ID)
	keys, _, err := OpenKeyring(syncTestPassword, keyringBytes)
	if err != nil {
		t.Fatal(err)
	}
	defer zeroKeys(keys)
	snapshotBytes, _ := drive.Get(context.Background(), snapshots[0].ID)
	_, body, err := OpenSnapshot(snapshotBytes, keys)
	if err != nil || len(body.Items) == 0 || body.DeviceName != "Computador teste" {
		t.Fatalf("snapshot = %+v, %v", body, err)
	}

	if _, err := preferences.Update(func(value *appwin.Preferences) error { value.Theme = "dark"; return nil }); err != nil {
		t.Fatal(err)
	}
	time.Sleep(70 * time.Millisecond)
	snapshots, _ = drive.List(context.Background(), SnapshotFiles, 10)
	if len(snapshots) != 1 {
		t.Fatalf("preferência local gerou snapshot: %d", len(snapshots))
	}
	if err := store.Mutate(func(content *model.Content) error {
		content.Hosts[0].Label = "Servidor alterado"
		content.Hosts[0].UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	waitSync(t, syncer, SyncStateSynced)
	snapshots, _ = drive.List(context.Background(), SnapshotFiles, 10)
	if len(snapshots) != 2 {
		t.Fatalf("mudança sincronizável gerou %d snapshots", len(snapshots))
	}
}

func TestSyncerRetriesOfflineAndStopsLocked(t *testing.T) {
	store, preferences := syncTestStore(t)
	fake := drivefake.New()
	defer fake.Close()
	drive := newDrive(fake.URL(), fake.Client())
	syncer := newSyncer(store, preferences, nil, nil, syncerOptions{Debounce: 15 * time.Millisecond, Poll: 30 * time.Millisecond,
		Retry: []time.Duration{15 * time.Millisecond, 30 * time.Millisecond}, Now: time.Now, DeviceName: func() string { return "Notebook" }})
	defer syncer.Close()
	if err := syncer.StartUpload(context.Background(), SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh"}, drive); err != nil {
		t.Fatal(err)
	}
	fake.SetOffline(true)
	if err := store.Mutate(func(content *model.Content) error {
		content.Hosts[0].Label = "Offline"
		content.Hosts[0].UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	waitSync(t, syncer, SyncStatePending)
	fake.SetOffline(false)
	waitSync(t, syncer, SyncStateSynced)
	store.Lock()
	waitSync(t, syncer, SyncStateLocked)
	requests := len(fake.Requests())
	time.Sleep(90 * time.Millisecond)
	if got := len(fake.Requests()); got != requests {
		t.Fatalf("cofre bloqueado fez requisições: %d -> %d", requests, got)
	}
}

func TestLocalVersionsDoNotDeleteUnknownItemType(t *testing.T) {
	store, preferences := syncTestStore(t)
	syncer := newSyncer(store, preferences, nil, nil, syncerOptions{Poll: time.Hour})
	defer syncer.Close()
	state := persistentSyncState{DeviceID: deviceA, Items: map[string]syncItemState{}, Conflicts: []Conflict{}}
	initial, _, _, err := syncer.localVersions(&state)
	if err != nil {
		t.Fatal(err)
	}
	state.Items = itemStates(initial)
	state.Items["futuro:1"] = syncItemState{VV: VersionVector{deviceB: 1}, Hash: StableItemHash([]byte(`{"future":true}`))}
	versions, changed, pending, err := syncer.localVersions(&state)
	if err != nil || changed || pending != 0 {
		t.Fatalf("localVersions = changed %v pending %d err %v", changed, pending, err)
	}
	for _, item := range versions {
		if item.Key == "futuro:1" {
			t.Fatalf("tipo desconhecido virou versão local: %+v", item)
		}
	}
}

func TestApplyVersionsIgnoresUnknownButRejectsInvalidSnippet(t *testing.T) {
	store, preferences := syncTestStore(t)
	syncer := newSyncer(store, preferences, nil, nil, syncerOptions{Poll: time.Hour})
	defer syncer.Close()
	state := persistentSyncState{DeviceID: deviceA, Items: map[string]syncItemState{}, Conflicts: []Conflict{}}
	known, _, _, err := syncer.localVersions(&state)
	if err != nil {
		t.Fatal(err)
	}
	unknown := version("futuro:1", `{"future":true}`, VersionVector{deviceB: 1})
	if err := syncer.applyVersions(append(known, unknown)); err != nil {
		t.Fatalf("tipo desconhecido recusado: %v", err)
	}
	content, err := store.Read()
	if err != nil || len(content.Hosts) != 1 {
		t.Fatalf("conteúdo conhecido perdido: %+v, %v", content, err)
	}
	invalid := version("snippet:11111111-2222-4333-8444-555555555555", `{"id":"11111111-2222-4333-8444-555555555555","name":"","text":"segredo","tags":[],"execute":false,"createdAt":"2026-10-30T12:00:00Z","updatedAt":"2026-10-30T12:00:00Z"}`, VersionVector{deviceB: 1})
	if err := syncer.applyVersions(append(known, invalid)); apperr.CodeOf(err) != apperr.CloudCorrupt {
		t.Fatalf("snippet inválido = %v", err)
	}
}

func syncTestStore(t *testing.T) (*vault.Store, *appwin.PreferenceStore) {
	t.Helper()
	store, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.Create(syncTestPassword, syncTestPassword); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	host := model.Host{ID: "10000000-0000-4000-8000-000000000001", Label: "Servidor", Address: "10.0.0.10", Port: 22,
		Username: "admin", AuthMethod: model.AuthAsk, CreatedAt: now, UpdatedAt: now, OSIcon: model.OSIconAuto}
	if err := store.Mutate(func(content *model.Content) error { content.Hosts = append(content.Hosts, host); return nil }); err != nil {
		t.Fatal(err)
	}
	return store, appwin.NewPreferenceStore(store)
}

func waitSync(t *testing.T, syncer *Syncer, state SyncState) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		info := syncer.Info()
		if info.State == state && (state != SyncStateSynced || info.Pending == 0) {
			return
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("timeout esperando %s; atual=%+v", state, syncer.Info())
}

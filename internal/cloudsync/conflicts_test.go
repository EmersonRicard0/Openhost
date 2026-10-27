package cloudsync

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/cloudsync/drivefake"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

const rotatedSyncPassword = "senha-sync-nova-2"

func TestTwoSyncersMergeDifferentItemsAndResolveSameItemConflict(t *testing.T) {
	pair := newSyncPair(t)
	mutateHostLabel(t, pair.aStore, pair.firstHost, "Alterado em A")
	mutateHostLabel(t, pair.bStore, pair.secondHost, "Alterado em B")
	mustSync(t, pair.a)
	mustSync(t, pair.b)
	mustSync(t, pair.a)
	assertHostLabel(t, pair.aStore, pair.firstHost, "Alterado em A")
	assertHostLabel(t, pair.aStore, pair.secondHost, "Alterado em B")
	assertHostLabel(t, pair.bStore, pair.firstHost, "Alterado em A")
	assertHostLabel(t, pair.bStore, pair.secondHost, "Alterado em B")

	mutateHostLabel(t, pair.aStore, pair.firstHost, "Conflito A")
	mutateHostLabel(t, pair.bStore, pair.firstHost, "Conflito B")
	mustSync(t, pair.a)
	mustSync(t, pair.b)
	if info := pair.b.Info(); info.State != SyncStateConflict || info.Conflicts != 1 {
		t.Fatalf("B sem conflito: %+v", info)
	}
	views, err := pair.b.Conflicts()
	if err != nil || len(views) != 1 || views[0].Key != "host:"+pair.firstHost || views[0].Label != "Conflito B" {
		t.Fatalf("Conflicts=%+v %v", views, err)
	}
	rawState, err := pair.bStore.SyncState()
	if err != nil {
		t.Fatal(err)
	}
	var persisted persistentSyncState
	if json.Unmarshal(rawState, &persisted) != nil || len(persisted.Conflicts) != 1 {
		t.Fatalf("conflito não persistido: %s", rawState)
	}
	if err := pair.b.Resolve(context.Background(), views[0].Key, "remote"); err != nil {
		t.Fatal(err)
	}
	assertHostLabel(t, pair.bStore, pair.firstHost, "Conflito A")
	mustSync(t, pair.a)
	assertHostLabel(t, pair.aStore, pair.firstHost, "Conflito A")
	if got, err := pair.a.Conflicts(); err != nil || len(got) != 0 {
		t.Fatalf("conflito remoto não foi encerrado: %+v %v", got, err)
	}
}

func TestEditDeleteConflictAndSecretMasking(t *testing.T) {
	pair := newSyncPair(t)
	mutateHostLabel(t, pair.aStore, pair.firstHost, "Editado em A")
	if err := pair.bStore.Mutate(func(content *model.Content) error {
		content.Hosts = removeHost(content.Hosts, pair.firstHost)
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	mustSync(t, pair.a)
	mustSync(t, pair.b)
	views, err := pair.b.Conflicts()
	if err != nil || len(views) != 1 || !views[0].Local.Deleted || views[0].Remote.Deleted {
		t.Fatalf("conflito edição/exclusão=%+v %v", views, err)
	}

	credentialID := "30000000-0000-4000-8000-000000000003"
	localData, _ := json.Marshal(model.Credential{ID: credentialID, Kind: model.CredentialPassword, Name: "Senha local", Password: "segredo-local", CreatedAt: "2026-10-27T12:00:00Z"})
	passphrase := "frase-secreta"
	remoteData, _ := json.Marshal(model.Credential{ID: credentialID, Kind: model.CredentialKey, Name: "Chave remota", PrivateKey: "CHAVE-PRIVADA", Passphrase: &passphrase, CreatedAt: "2026-10-27T12:00:00Z"})
	pair.b.mu.Lock()
	pair.b.state.Conflicts = []Conflict{{Key: "credential:" + credentialID,
		Local:      ItemVersion{Key: "credential:" + credentialID, VV: VersionVector{"1111111111111111": 1}, Data: localData},
		Remote:     ItemVersion{Key: "credential:" + credentialID, VV: VersionVector{"2222222222222222": 1}, Data: remoteData},
		DetectedAt: "2026-10-27T12:00:00Z"}}
	pair.b.mu.Unlock()
	masked, err := pair.b.Conflicts()
	if err != nil || len(masked) != 1 {
		t.Fatalf("conflito de credencial=%+v %v", masked, err)
	}
	encoded, _ := json.Marshal(masked)
	text := string(encoded)
	for _, secret := range []string{"segredo-local", "CHAVE-PRIVADA", "frase-secreta"} {
		if strings.Contains(text, secret) {
			t.Fatalf("segredo vazou em ConflictView: %s", text)
		}
	}
	if !strings.Contains(text, "••••") {
		t.Fatalf("máscara ausente: %s", text)
	}
}

func TestPasswordRotationMakesOtherComputerRequestAndAdoptNewPassword(t *testing.T) {
	pair := newSyncPair(t)
	if err := pair.a.ChangePassword(context.Background(), syncTestPassword, rotatedSyncPassword, rotatedSyncPassword); err != nil {
		t.Fatal(err)
	}
	if err := pair.b.SyncNow(context.Background()); err != nil {
		t.Fatal(err)
	}
	if info := pair.b.Info(); info.State != SyncStateNeedsPassword {
		t.Fatalf("B não pediu senha nova: %+v", info)
	}
	if err := pair.b.ProvidePassword(context.Background(), syncTestPassword); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha antiga em B=%v", err)
	}
	if info := pair.b.Info(); info.State != SyncStateNeedsPassword {
		t.Fatalf("senha errada tirou needsPassword: %+v", info)
	}
	if err := pair.b.ProvidePassword(context.Background(), rotatedSyncPassword); err != nil {
		t.Fatal(err)
	}
	if info := pair.b.Info(); info.State != SyncStateSynced {
		t.Fatalf("B após senha nova: %+v", info)
	}
	for name, store := range map[string]*vault.Store{"A": pair.aStore, "B": pair.bStore} {
		store.Lock()
		if err := store.Unlock(syncTestPassword); apperr.CodeOf(err) != apperr.VaultBadPassword {
			t.Fatalf("%s ainda abriu com senha antiga: %v", name, err)
		}
		if err := store.Unlock(rotatedSyncPassword); err != nil {
			t.Fatalf("%s não abriu com senha nova: %v", name, err)
		}
	}
	files, err := pair.drive.List(context.Background(), KeyringFiles, 2)
	if err != nil || len(files) != 1 {
		t.Fatalf("keyring=%+v %v", files, err)
	}
	data, err := pair.drive.Get(context.Background(), files[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := OpenKeyring(syncTestPassword, data); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("keyring aceitou senha antiga: %v", err)
	}
	keys, ring, err := OpenKeyring(rotatedSyncPassword, data)
	if err != nil {
		t.Fatal(err)
	}
	defer zeroKeys(keys)
	if ring.Epoch != 2 || len(keys) != 2 {
		t.Fatalf("keyring após rotação=%+v keys=%d", ring, len(keys))
	}
}

func TestPasswordRotationRecoversWhenKeyringWasAlreadyPublished(t *testing.T) {
	pair := newSyncPair(t)
	files, err := pair.drive.List(context.Background(), KeyringFiles, 2)
	if err != nil || len(files) != 1 {
		t.Fatalf("keyring=%+v %v", files, err)
	}
	raw, err := pair.drive.Get(context.Background(), files[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	keys, ring, err := OpenKeyring(syncTestPassword, raw)
	if err != nil {
		t.Fatal(err)
	}
	defer zeroKeys(keys)
	newDEK := vault.RandomKey()
	defer vault.Zero(newDEK)
	keys[2] = append([]byte(nil), newDEK...)
	params := vault.KDFParams{Time: ring.KDF.Time, MemoryKiB: ring.KDF.MemoryKiB, Salt: vault.RandomSalt()}
	rotated, err := SealKeyring(rotatedSyncPassword, params, 2, keys)
	if err != nil {
		t.Fatal(err)
	}
	if err := pair.drive.UpdateKeyring(context.Background(), files[0].ID, rotated); err != nil {
		t.Fatal(err)
	}
	if err := pair.a.ChangePassword(context.Background(), syncTestPassword, rotatedSyncPassword, rotatedSyncPassword); err != nil {
		t.Fatal(err)
	}
	pair.aStore.Lock()
	if err := pair.aStore.Unlock(syncTestPassword); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha antiga ainda abre: %v", err)
	}
	if err := pair.aStore.Unlock(rotatedSyncPassword); err != nil {
		t.Fatal(err)
	}
}

type syncPair struct {
	fake                  *drivefake.Server
	drive                 *Drive
	aStore, bStore        *vault.Store
	a, b                  *Syncer
	firstHost, secondHost string
}

func newSyncPair(t *testing.T) syncPair {
	t.Helper()
	first := "10000000-0000-4000-8000-000000000001"
	second := "20000000-0000-4000-8000-000000000002"
	fake := drivefake.New()
	t.Cleanup(fake.Close)
	drive := newDrive(fake.URL(), fake.Client())
	aStore := localVault(t, t.TempDir(), syncTestPassword,
		testHost(first, "Primeiro", "first.example.test"), testHost(second, "Segundo", "second.example.test"))
	t.Cleanup(func() { _ = aStore.Close() })
	optionsA := syncerOptions{Debounce: time.Hour, Poll: time.Hour, Retry: []time.Duration{time.Hour}, Now: time.Now, DeviceName: func() string { return "Computador A" }}
	a := newSyncer(aStore, appwin.NewPreferenceStore(aStore), nil, nil, optionsA)
	t.Cleanup(a.Close)
	if err := a.StartUpload(context.Background(), SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh-a"}, drive); err != nil {
		t.Fatal(err)
	}
	bStore, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bStore.Close() })
	optionsB := syncerOptions{Debounce: time.Hour, Poll: time.Hour, Retry: []time.Duration{time.Hour}, Now: time.Now, DeviceName: func() string { return "Computador B" }}
	b := newSyncer(bStore, appwin.NewPreferenceStore(bStore), nil, nil, optionsB)
	t.Cleanup(b.Close)
	if err := b.OpenFromCloud(context.Background(), SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh-b"}, drive, syncTestPassword); err != nil {
		t.Fatal(err)
	}
	return syncPair{fake: fake, drive: drive, aStore: aStore, bStore: bStore, a: a, b: b, firstHost: first, secondHost: second}
}

func mustSync(t *testing.T, syncer *Syncer) {
	t.Helper()
	if err := syncer.SyncNow(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func mutateHostLabel(t *testing.T, store *vault.Store, id, label string) {
	t.Helper()
	if err := store.Mutate(func(content *model.Content) error {
		for index := range content.Hosts {
			if content.Hosts[index].ID == id {
				content.Hosts[index].Label = label
				content.Hosts[index].UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
				return nil
			}
		}
		return apperr.New(apperr.NotFound)
	}); err != nil {
		t.Fatal(err)
	}
}

func assertHostLabel(t *testing.T, store *vault.Store, id, label string) {
	t.Helper()
	content, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	for _, host := range content.Hosts {
		if host.ID == id {
			if host.Label != label {
				t.Fatalf("host %s: label=%q, esperado=%q", id, host.Label, label)
			}
			return
		}
	}
	t.Fatalf("host %s não encontrado", id)
}

func removeHost(hosts []model.Host, id string) []model.Host {
	result := hosts[:0]
	for _, host := range hosts {
		if host.ID != id {
			result = append(result, host)
		}
	}
	return result
}

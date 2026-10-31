package cloudsync

import (
	"context"
	"crypto/sha256"
	"os"
	"path/filepath"
	"testing"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/cloudsync/drivefake"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

const (
	cloudPassword = "senha-da-nuvem-123"
	localPassword = "senha-local-456"
)

func TestOpenFromCloudWrongPasswordWritesNothingThenCreatesVault(t *testing.T) {
	fake, drive := seededCloud(t)
	defer fake.Close()
	dir := t.TempDir()
	store, err := vault.Open(dir, vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	syncer := NewSyncer(store, appwin.NewPreferenceStore(store), nil, nil)
	defer syncer.Close()
	before := directoryDigests(t, dir)
	account := SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh"}
	if err := syncer.OpenFromCloud(context.Background(), account, drive, "senha-errada"); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha errada = %v", err)
	}
	after := directoryDigests(t, dir)
	if !equalDigests(before, after) {
		t.Fatalf("senha errada alterou a pasta: antes=%v depois=%v", before, after)
	}
	if store.Status().State != vault.StateNonexistent {
		t.Fatalf("senha errada criou cofre: %+v", store.Status())
	}
	if err := syncer.OpenFromCloud(context.Background(), account, drive, cloudPassword); err != nil {
		t.Fatal(err)
	}
	content, err := store.Read()
	if err != nil || len(content.Hosts) != 1 || content.Hosts[0].Address != "cloud.example.test" {
		t.Fatalf("conteúdo aberto = %+v, %v", content, err)
	}
}

func TestOpenFromCloudEmptyAccount(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	store, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	syncer := NewSyncer(store, appwin.NewPreferenceStore(store), nil, nil)
	defer syncer.Close()
	err = syncer.OpenFromCloud(context.Background(), SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh"}, newDrive(fake.URL(), fake.Client()), cloudPassword)
	if apperr.CodeOf(err) != apperr.CloudEmpty || store.Status().State != vault.StateNonexistent {
		t.Fatalf("nuvem vazia = %v, status=%+v", err, store.Status())
	}
}

func TestStartReplaceBacksUpBeforeUsingCloudVault(t *testing.T) {
	fake, drive := seededCloud(t)
	defer fake.Close()
	dir := t.TempDir()
	store := localVault(t, dir, localPassword, testHost("20000000-0000-4000-8000-000000000002", "Local", "local.example.test"))
	defer store.Close()
	syncer := NewSyncer(store, appwin.NewPreferenceStore(store), nil, nil)
	defer syncer.Close()
	account := SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh"}
	if err := syncer.StartFromCloud(context.Background(), "replace", account, drive, cloudPassword); err != nil {
		t.Fatal(err)
	}
	content, _ := store.Read()
	if len(content.Hosts) != 1 || content.Hosts[0].Address != "cloud.example.test" {
		t.Fatalf("replace não usou nuvem: %+v", content.Hosts)
	}
	backups, _ := filepath.Glob(filepath.Join(dir, "vault-backup-*.db"))
	if len(backups) != 1 {
		t.Fatalf("backups = %v", backups)
	}
	backupDir := t.TempDir()
	copyFile(t, backups[0], filepath.Join(backupDir, vault.DBFile))
	backup, err := vault.Open(backupDir, vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	defer backup.Close()
	if err := backup.Unlock(localPassword); err != nil {
		t.Fatalf("backup não abre com senha local: %v", err)
	}
	old, _ := backup.Read()
	if len(old.Hosts) != 1 || old.Hosts[0].Address != "local.example.test" {
		t.Fatalf("backup não preservou local: %+v", old.Hosts)
	}
	store.Lock()
	if err := store.Unlock(localPassword); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha local ainda abre após replace: %v", err)
	}
	if err := store.Unlock(cloudPassword); err != nil {
		t.Fatalf("senha da nuvem não abre após replace: %v", err)
	}
}

func TestStartMergeDeduplicatesContentKeysAndUsesCloudPassword(t *testing.T) {
	fake, drive := seededCloud(t)
	defer fake.Close()
	dir := t.TempDir()
	duplicate := testHost("30000000-0000-4000-8000-000000000003", "Mesmo destino local", "cloud.example.test")
	unique := testHost("40000000-0000-4000-8000-000000000004", "Somente local", "unique.example.test")
	store := localVault(t, dir, localPassword, duplicate, unique)
	defer store.Close()
	syncer := NewSyncer(store, appwin.NewPreferenceStore(store), nil, nil)
	defer syncer.Close()
	account := SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh"}
	if err := syncer.StartFromCloud(context.Background(), "merge", account, drive, cloudPassword); err != nil {
		t.Fatal(err)
	}
	content, _ := store.Read()
	if len(content.Hosts) != 2 || countAddress(content.Hosts, "cloud.example.test") != 1 || countAddress(content.Hosts, "unique.example.test") != 1 {
		t.Fatalf("merge/dedup = %+v", content.Hosts)
	}
	store.Lock()
	if err := store.Unlock(localPassword); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha local ainda abre após merge: %v", err)
	}
	if err := store.Unlock(cloudPassword); err != nil {
		t.Fatalf("senha da nuvem não abre após merge: %v", err)
	}
}

func TestDeduplicateLocalUsesAllR6ContentKeysAndRemapsReferences(t *testing.T) {
	remoteRoot, remoteChild := "50000000-0000-4000-8000-000000000005", "60000000-0000-4000-8000-000000000006"
	remoteCredential, remoteHost := "70000000-0000-4000-8000-000000000007", "80000000-0000-4000-8000-000000000008"
	remote := SyncData{Content: model.EmptyContent()}
	remote.Content.Groups = []model.Group{
		{ID: remoteRoot, Name: "Produção"},
		{ID: remoteChild, Name: "Bancos", ParentID: &remoteRoot},
	}
	remote.Content.Credentials = []model.Credential{{ID: remoteCredential, Kind: model.CredentialPassword, Name: "Nuvem", Password: "segredo", CreatedAt: "2026-10-27T12:00:00Z"}}
	remote.Content.Hosts = []model.Host{testHostWithReferences(remoteHost, "Nuvem", "DB.EXAMPLE.TEST", remoteChild, remoteCredential)}

	localRoot, localChild := "90000000-0000-4000-8000-000000000009", "a0000000-0000-4000-8000-00000000000a"
	localCredential, localHost := "b0000000-0000-4000-8000-00000000000b", "c0000000-0000-4000-8000-00000000000c"
	uniqueHost, forwardID := "d0000000-0000-4000-8000-00000000000d", "e0000000-0000-4000-8000-00000000000e"
	local := SyncData{Content: model.EmptyContent()}
	local.Content.Groups = []model.Group{
		{ID: localRoot, Name: " produção "},
		{ID: localChild, Name: "BANCOS", ParentID: &localRoot},
	}
	local.Content.Credentials = []model.Credential{{ID: localCredential, Kind: model.CredentialPassword, Name: "Local", Password: "segredo", CreatedAt: "2026-10-27T13:00:00Z"}}
	local.Content.Hosts = []model.Host{
		testHostWithReferences(localHost, "Mesmo destino", "db.example.test", localChild, localCredential),
		testHostWithReferences(uniqueHost, "Único", "unique.example.test", localChild, localCredential),
	}
	local.Content.ForwardRules = []model.ForwardRule{{ID: forwardID, HostID: localHost, BindAddress: "127.0.0.1", BindPort: 2200, DestHost: "db.internal", DestPort: 5432}}

	got := deduplicateLocal(local, remote)
	if len(got.Content.Groups) != 0 || len(got.Content.Credentials) != 0 {
		t.Fatalf("grupos/credenciais duplicados permaneceram: %+v %+v", got.Content.Groups, got.Content.Credentials)
	}
	if len(got.Content.Hosts) != 1 || got.Content.Hosts[0].ID != uniqueHost || got.Content.Hosts[0].GroupID == nil || *got.Content.Hosts[0].GroupID != remoteChild || got.Content.Hosts[0].CredentialID == nil || *got.Content.Hosts[0].CredentialID != remoteCredential {
		t.Fatalf("host único/referências = %+v", got.Content.Hosts)
	}
	if len(got.Content.ForwardRules) != 1 || got.Content.ForwardRules[0].HostID != remoteHost {
		t.Fatalf("regra não remapeada = %+v", got.Content.ForwardRules)
	}
}

func seededCloud(t *testing.T) (*drivefake.Server, *Drive) {
	t.Helper()
	fake := drivefake.New()
	drive := newDrive(fake.URL(), fake.Client())
	store := localVault(t, t.TempDir(), cloudPassword, testHost("10000000-0000-4000-8000-000000000001", "Nuvem", "cloud.example.test"))
	syncer := NewSyncer(store, appwin.NewPreferenceStore(store), nil, nil)
	if err := syncer.StartUpload(context.Background(), SyncAccount{Email: "usuario@example.com", RefreshToken: "refresh"}, drive); err != nil {
		t.Fatal(err)
	}
	syncer.Close()
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	return fake, drive
}

func localVault(t *testing.T, dir, password string, hosts ...model.Host) *vault.Store {
	t.Helper()
	store, err := vault.Open(dir, vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Create(password, password); err != nil {
		t.Fatal(err)
	}
	if err := store.Mutate(func(content *model.Content) error { content.Hosts = append(content.Hosts, hosts...); return nil }); err != nil {
		t.Fatal(err)
	}
	return store
}

func testHost(id, label, address string) model.Host {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	return model.Host{ID: id, Label: label, Address: address, Port: 22, Username: "admin", AuthMethod: model.AuthAsk,
		CreatedAt: now, UpdatedAt: now, OSIcon: model.OSIconAuto}
}

func testHostWithReferences(id, label, address, groupID, credentialID string) model.Host {
	host := testHost(id, label, address)
	host.AuthMethod = model.AuthPassword
	host.GroupID = &groupID
	host.CredentialID = &credentialID
	return host
}

func directoryDigests(t *testing.T, dir string) map[string][sha256.Size]byte {
	t.Helper()
	result := map[string][sha256.Size]byte{}
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		result[entry.Name()] = sha256.Sum256(data)
	}
	return result
}

func equalDigests(left, right map[string][sha256.Size]byte) bool {
	if len(left) != len(right) {
		return false
	}
	for key, value := range left {
		if right[key] != value {
			return false
		}
	}
	return true
}

func copyFile(t *testing.T, source, target string) {
	t.Helper()
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func countAddress(hosts []model.Host, address string) int {
	count := 0
	for _, host := range hosts {
		if host.Address == address {
			count++
		}
	}
	return count
}

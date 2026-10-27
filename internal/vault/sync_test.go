package vault

import (
	"bytes"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func TestMigratesVersionOneDatabaseToSyncState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, DBFile)
	db, err := sql.Open("sqlite", filepath.ToSlash(path))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(migrations[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`PRAGMA user_version = 1`); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}

	store := openTest(t, dir)
	var version, tableCount int
	if err := store.db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if err := store.db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='sync_state'`).Scan(&tableCount); err != nil {
		t.Fatal(err)
	}
	if version != 2 || tableCount != 1 {
		t.Fatalf("migração 1→2 incompleta: version=%d sync_state=%d", version, tableCount)
	}
}

func TestSyncStateIsSealedAndEraseRemovesIt(t *testing.T) {
	store := openTest(t, t.TempDir())
	if err := store.Create(pw, pw); err != nil {
		t.Fatal(err)
	}
	plain := []byte(`{"account":{"email":"conta-unica@example.com","refreshToken":"token-super-secreto"},"dirty":true}`)
	if err := store.SetSyncState(plain); err != nil {
		t.Fatal(err)
	}
	var sealed []byte
	if err := store.db.QueryRow(`SELECT sealed FROM sync_state WHERE id = 1`).Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(sealed, []byte("conta-unica")) || bytes.Contains(sealed, []byte("token-super-secreto")) {
		t.Fatal("sync_state contém dados sensíveis em claro")
	}
	got, err := store.SyncState()
	if err != nil || !bytes.Equal(got, plain) {
		t.Fatalf("SyncState = %q, %v", got, err)
	}
	got[0] ^= 0xff
	again, _ := store.SyncState()
	if bytes.Equal(got, again) {
		t.Fatal("SyncState expôs o buffer interno")
	}
	if err := store.Erase(); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := store.db.QueryRow(`SELECT count(*) FROM sync_state`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("sync_state sobreviveu ao Erase: %d, %v", count, err)
	}
}

func TestOnChangeOnlyAfterSuccessfulLocalChanges(t *testing.T) {
	store := openTest(t, t.TempDir())
	if err := store.Create(pw, pw); err != nil {
		t.Fatal(err)
	}
	changes := 0
	store.OnChange(func() {
		changes++
		_ = store.Status() // callback roda depois de liberar o lock
	})
	if err := store.Mutate(func(*model.Content) error { return errors.New("falha") }); err == nil {
		t.Fatal("mutação deveria falhar")
	}
	if changes != 0 {
		t.Fatalf("falha notificou mudança: %d", changes)
	}
	if err := store.Mutate(func(content *model.Content) error {
		content.Hosts = append(content.Hosts, sampleHost(hostA))
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if changes != 1 {
		t.Fatalf("mutação bem-sucedida notificou %d vezes", changes)
	}
	content, _ := store.Read()
	content.Hosts[0].Label = "aplicado da nuvem"
	if err := store.Apply(content); err != nil {
		t.Fatal(err)
	}
	if changes != 1 {
		t.Fatalf("Apply da nuvem notificou mudança local: %d", changes)
	}
	profile, _ := store.GlobalProfile()
	profile.FontSize++
	if err := store.SaveGlobalProfile(profile); err != nil {
		t.Fatal(err)
	}
	if changes != 2 {
		t.Fatalf("perfil não notificou: %d", changes)
	}
	scheme := brandScheme()
	scheme.ID, scheme.Name, scheme.Origin = "00000000-0000-4000-8000-0000000000ff", "Sync teste", model.SchemeCustom
	if err := store.SaveColorScheme(scheme); err != nil {
		t.Fatal(err)
	}
	if changes != 3 {
		t.Fatalf("esquema não notificou: %d", changes)
	}
}

func TestRekeyIsAtomicAndResealsEverySecret(t *testing.T) {
	store := openTest(t, t.TempDir())
	if err := store.Create(pw, pw); err != nil {
		t.Fatal(err)
	}
	addHosts(t, store, hostA)
	if err := store.SetSyncState([]byte(`{"refreshToken":"segredo"}`)); err != nil {
		t.Fatal(err)
	}
	before := sealedOf(t, store.db, hostA)
	if _, err := store.db.Exec(`CREATE TRIGGER fail_rekey BEFORE UPDATE OF sealed ON hosts
		BEGIN SELECT RAISE(ABORT, 'falha injetada'); END`); err != nil {
		t.Fatal(err)
	}
	newDEK := RandomKey()
	if err := store.Rekey("nova-senha-2", newDEK); err == nil {
		t.Fatal("Rekey deveria falhar no meio")
	}
	if !bytes.Equal(before, sealedOf(t, store.db, hostA)) {
		t.Fatal("Rekey parcial alterou host")
	}
	store.Lock()
	if err := store.Unlock(pw); err != nil {
		t.Fatalf("senha antiga deixou de abrir após rollback: %v", err)
	}
	if _, err := store.SyncState(); err != nil {
		t.Fatalf("sync_state deixou de abrir após rollback: %v", err)
	}
	if _, err := store.db.Exec(`DROP TRIGGER fail_rekey`); err != nil {
		t.Fatal(err)
	}
	if err := store.Rekey("nova-senha-2", newDEK); err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(before, sealedOf(t, store.db, hostA)) {
		t.Fatal("Rekey não recifrou o host")
	}
	store.Lock()
	if err := store.Unlock(pw); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha antiga após Rekey = %v", err)
	}
	if err := store.Unlock("nova-senha-2"); err != nil {
		t.Fatal(err)
	}
	state, err := store.SyncState()
	if err != nil || !bytes.Contains(state, []byte("segredo")) {
		t.Fatalf("sync_state após Rekey = %q, %v", state, err)
	}
}

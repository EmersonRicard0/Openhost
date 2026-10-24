package vault

import (
	"bytes"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

const pw = "senha-teste-1"

func openTest(t *testing.T, dir string) *Store {
	t.Helper()
	s, err := Open(dir, TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func wantCode(t *testing.T, err error, code apperr.Code) {
	t.Helper()
	if apperr.CodeOf(err) != code {
		t.Fatalf("esperava %s, veio %v", code, err)
	}
}

func sampleHost(id string) model.Host {
	return model.Host{
		ID: id, Label: "OLT-Rotulo-Unico", Address: "10.99.88.77", Port: 22,
		Username: "usuario-unico-xyz", AuthMethod: model.AuthAsk,
		CreatedAt: "2026-10-23T12:00:00.000Z", UpdatedAt: "2026-10-23T12:00:00.000Z",
	}
}

const hostA = "4ce66518-3068-4bef-ad0b-eb3f0141443d"
const hostB = "0b0195ab-f3d5-4823-b800-7a500929825a"

func addHosts(t *testing.T, s *Store, ids ...string) {
	t.Helper()
	err := s.Mutate(func(c *model.Content) error {
		for _, id := range ids {
			c.Hosts = append(c.Hosts, sampleHost(id))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestStatesAndCreate(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	if s.Status().State != StateNonexistent {
		t.Fatalf("estado inicial %s", s.Status().State)
	}
	wantCode(t, s.Create("curta", "curta"), apperr.WeakPassword)
	wantCode(t, s.Create(pw, pw+"x"), apperr.InvalidInput)
	if err := s.Create(pw, pw); err != nil {
		t.Fatal(err)
	}
	if s.Status().State != StateUnlocked {
		t.Fatalf("depois de criar: %s", s.Status().State)
	}
	wantCode(t, s.Create(pw, pw), apperr.VaultExists)
}

func TestUnlockLockAndReopen(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	if err := s.Create(pw, pw); err != nil {
		t.Fatal(err)
	}
	addHosts(t, s, hostA)
	var events []State
	s.OnStatus(func(st Status) { events = append(events, st.State) })
	s.Lock()
	if s.dek != nil || s.content != nil {
		t.Fatal("bloquear não descartou chave e conteúdo")
	}
	_, err := s.Read()
	wantCode(t, err, apperr.VaultLocked)
	_ = s.Close()

	s2 := openTest(t, dir)
	if s2.Status().State != StateLocked {
		t.Fatalf("reaberto: %s", s2.Status().State)
	}
	wantCode(t, s2.Unlock("senha-errada-1"), apperr.VaultBadPassword)
	if err := s2.Unlock(pw); err != nil {
		t.Fatal(err)
	}
	c, err := s2.Read()
	if err != nil || len(c.Hosts) != 1 || c.Hosts[0] != sampleHost(hostA) {
		t.Fatalf("conteúdo após reabrir: %+v, %v", c, err)
	}
	if c.Settings.KeepaliveSeconds != 30 || c.Settings.ConnectTimeoutSeconds != 15 ||
		c.Settings.AutoLockMinutes == nil || *c.Settings.AutoLockMinutes != 15 {
		t.Fatalf("configurações padrão erradas: %+v", c.Settings)
	}
	if len(events) != 1 || events[0] != StateLocked {
		t.Fatalf("eventos de estado: %v", events)
	}
}

func TestReadReturnsCopy(t *testing.T) {
	s := openTest(t, t.TempDir())
	_ = s.Create(pw, pw)
	addHosts(t, s, hostA)
	c, _ := s.Read()
	c.Hosts[0].Label = "alterado"
	c2, _ := s.Read()
	if c2.Hosts[0].Label != "OLT-Rotulo-Unico" {
		t.Fatal("Read expôs o estado interno")
	}
}

func TestMutateErrorRollsBack(t *testing.T) {
	s := openTest(t, t.TempDir())
	_ = s.Create(pw, pw)
	err := s.Mutate(func(c *model.Content) error {
		c.Hosts = append(c.Hosts, sampleHost(hostA))
		return apperr.New(apperr.InvalidInput)
	})
	wantCode(t, err, apperr.InvalidInput)
	c, _ := s.Read()
	if len(c.Hosts) != 0 {
		t.Fatal("mutação com erro foi aplicada")
	}
}

func TestMutateDeletesRows(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	_ = s.Create(pw, pw)
	addHosts(t, s, hostA, hostB)
	_ = s.Mutate(func(c *model.Content) error { c.Hosts = c.Hosts[:1]; return nil })
	var n int
	_ = s.db.QueryRow(`SELECT count(*) FROM hosts`).Scan(&n)
	if n != 1 {
		t.Fatalf("linhas em hosts: %d", n)
	}
}

func sealedOf(t *testing.T, db *sql.DB, id string) []byte {
	t.Helper()
	var b []byte
	if err := db.QueryRow(`SELECT sealed FROM hosts WHERE id = ?`, id).Scan(&b); err != nil {
		t.Fatal(err)
	}
	return b
}

func TestChangePasswordRewrapsOnly(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	_ = s.Create(pw, pw)
	addHosts(t, s, hostA)
	before := sealedOf(t, s.db, hostA)
	wantCode(t, s.ChangePassword("errada-errada", "nova-senha-2", "nova-senha-2"), apperr.VaultBadPassword)
	wantCode(t, s.ChangePassword(pw, "curta", "curta"), apperr.WeakPassword)
	if err := s.ChangePassword(pw, "nova-senha-2", "nova-senha-2"); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, sealedOf(t, s.db, hostA)) {
		t.Fatal("trocar a senha recifrou as linhas")
	}
	s.Lock()
	wantCode(t, s.Unlock(pw), apperr.VaultBadPassword)
	if err := s.Unlock("nova-senha-2"); err != nil {
		t.Fatal(err)
	}
}

func TestSwappedRowsFailAuthentication(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	_ = s.Create(pw, pw)
	addHosts(t, s, hostA, hostB)
	a, b := sealedOf(t, s.db, hostA), sealedOf(t, s.db, hostB)
	_, _ = s.db.Exec(`UPDATE hosts SET sealed = ? WHERE id = ?`, b, hostA)
	_, _ = s.db.Exec(`UPDATE hosts SET sealed = ? WHERE id = ?`, a, hostB)
	s.Lock()
	err := s.Unlock(pw)
	wantCode(t, err, apperr.VaultUnreadable)
	if st := s.Status(); st.State != StateUnreadable || st.Reason == nil || *st.Reason != ReasonCorrupted {
		t.Fatalf("estado: %+v", st)
	}
}

func TestEraseKeepsPreferences(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	_ = s.Create(pw, pw)
	addHosts(t, s, hostA)
	if err := s.SetPreference("theme", "dark"); err != nil {
		t.Fatal(err)
	}
	if err := s.Erase(); err != nil {
		t.Fatal(err)
	}
	if s.Status().State != StateNonexistent {
		t.Fatalf("após apagar: %s", s.Status().State)
	}
	var n int
	_ = s.db.QueryRow(`SELECT count(*) FROM hosts`).Scan(&n)
	if n != 0 {
		t.Fatal("hosts sobreviveram ao apagar")
	}
	var theme string
	if ok, err := s.Preference("theme", &theme); err != nil || !ok || theme != "dark" {
		t.Fatalf("preferência perdida: %q %v %v", theme, ok, err)
	}
}

func TestPreferencesWorkWhileLocked(t *testing.T) {
	s := openTest(t, t.TempDir())
	if err := s.SetPreference("defaultShell", "cmd"); err != nil {
		t.Fatal(err)
	}
	var v string
	if ok, _ := s.Preference("defaultShell", &v); !ok || v != "cmd" {
		t.Fatalf("got %q", v)
	}
	if ok, _ := s.Preference("inexistente", &v); ok {
		t.Fatal("preferência inexistente encontrada")
	}
}

func TestSecureDeleteOn(t *testing.T) {
	s := openTest(t, t.TempDir())
	var on int
	if err := s.db.QueryRow(`PRAGMA secure_delete`).Scan(&on); err != nil || on != 1 {
		t.Fatalf("secure_delete = %d, %v", on, err)
	}
}

func TestNoPlaintextOnDisk(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	_ = s.Create(pw, pw)
	addHosts(t, s, hostA)
	_ = s.Mutate(func(c *model.Content) error {
		c.Credentials = append(c.Credentials, model.Credential{
			ID: hostB, Kind: model.CredentialPassword, Name: "cred-nome-unico",
			Password: "senha-do-servidor-987", CreatedAt: "2026-10-23T12:00:00.000Z",
		})
		return nil
	})
	s.Lock()
	_ = s.Close()
	needles := []string{"OLT-Rotulo-Unico", "10.99.88.77", "usuario-unico-xyz", "cred-nome-unico", "senha-do-servidor-987", pw}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		data, _ := os.ReadFile(filepath.Join(dir, e.Name()))
		for _, n := range needles {
			if bytes.Contains(data, []byte(n)) {
				t.Errorf("%s contém %q em claro", e.Name(), n)
			}
		}
	}
}

func TestMigratableAndUnreadable(t *testing.T) {
	dir := t.TempDir()
	_ = os.WriteFile(filepath.Join(dir, "vault.svlt"), []byte("SVLT"), 0o600)
	s := openTest(t, dir)
	if s.Status().State != StateMigratable {
		t.Fatalf("com vault.svlt: %s", s.Status().State)
	}

	bad := t.TempDir()
	_ = os.WriteFile(filepath.Join(bad, DBFile), []byte("isto não é sqlite, é lixo puro......................................................................................"), 0o600)
	s2 := openTest(t, bad)
	if st := s2.Status(); st.State != StateUnreadable || *st.Reason != ReasonCorrupted {
		t.Fatalf("banco corrompido: %+v", st)
	}
}

func TestNewerSchemaIsUnsupported(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	_ = s.Create(pw, pw)
	_, _ = s.db.Exec(`PRAGMA user_version = 99`)
	_ = s.Close()
	s2 := openTest(t, dir)
	if st := s2.Status(); st.State != StateUnreadable || *st.Reason != ReasonUnsupportedVersion {
		t.Fatalf("esquema novo demais: %+v", st)
	}
}

func TestNoopMutateAfterReloadWritesNothing(t *testing.T) {
	dir := t.TempDir()
	s := openTest(t, dir)
	_ = s.Create(pw, pw)
	gid := "11111111-2222-4333-8444-555555555555"
	_ = s.Mutate(func(c *model.Content) error {
		c.Groups = append(c.Groups, model.Group{ID: gid, Name: "NOC"})
		h := sampleHost(hostA)
		h.GroupID = &gid
		c.Hosts = append(c.Hosts, h)
		return nil
	})
	s.Lock()
	if err := s.Unlock(pw); err != nil {
		t.Fatal(err)
	}
	before := sealedOf(t, s.db, hostA)
	if err := s.Mutate(func(c *model.Content) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, sealedOf(t, s.db, hostA)) {
		t.Fatal("mutação vazia regravou a linha (assinatura de leitura difere da de escrita)")
	}
}

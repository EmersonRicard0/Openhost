package importer_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/exporter"
	"shellvault/internal/importer"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

func encryptedOpenHost(t *testing.T) ([]byte, *model.Content, string, string) {
	t.Helper()
	content := model.EmptyContent()
	groupID := domain.NewID()
	emptyGroupID := domain.NewID()
	content.Groups = []model.Group{
		{ID: groupID, Name: "Sites", SortOrder: 3},
		{ID: emptyGroupID, Name: "Vazio", ParentID: model.Ptr(groupID), SortOrder: 7},
	}
	key, err := domain.GenerateEd25519(content, "Chave exportada", nil, domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	password, err := domain.CreatePassword(content, "Senha", "não-exportar", domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	keyHostID, passwordHostID := domain.NewID(), domain.NewID()
	content.Hosts = []model.Host{
		{ID: keyHostID, Label: "Com chave", Address: "key.example", Port: 22, Username: "ops", AuthMethod: model.AuthKey, CredentialID: model.Ptr(key.ID), GroupID: model.Ptr(groupID), LegacyAlgorithms: true, OSIcon: "huawei"},
		{ID: passwordHostID, Label: "Com senha", Address: "password.example", Port: 2200, Username: "root", AuthMethod: model.AuthPassword, CredentialID: model.Ptr(password.ID), OSIcon: model.OSIconAuto},
	}
	content.ForwardRules = []model.ForwardRule{{ID: domain.NewID(), HostID: keyHostID, BindAddress: "127.0.0.1", BindPort: 10022, DestHost: "target", DestPort: 22}}
	profile := model.TerminalProfile{ID: domain.NewID(), Name: "Perfil", FontFamily: "Cascadia Mono", FontSize: 13, FontWeight: 400, FontWeightBold: 700, LineHeight: 1.2, CursorStyle: model.CursorBlock, CursorBlink: true, Scrollback: 10000, BackgroundOpacity: 1, Padding: 12, ColorSchemeID: vault.BrandSchemeID}
	raw, err := exporter.MarshalOpenHost(content, exporter.OpenHostOptions{Profiles: map[string]*model.TerminalProfile{keyHostID: &profile}, IncludeKeys: true, FilePassword: "senha-arquivo", KDF: vault.TestKDF})
	if err != nil {
		t.Fatal(err)
	}
	return raw, content, keyHostID, key.ID
}

func writeOpenHost(t *testing.T, raw []byte) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "hosts.openhost")
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadOpenHostRoundTripUsesNewIDsAndPreservesExtra(t *testing.T) {
	raw, original, oldHostID, oldKeyID := encryptedOpenHost(t)
	password := "senha-arquivo"
	preview, err := importer.LoadOpenHost(writeOpenHost(t, raw), &password, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	if preview.Kind != importer.SourceOpenHost || len(preview.Rows) != 2 || len(preview.Groups) != 2 || len(preview.Keys) != 1 {
		t.Fatalf("prévia incompleta: %+v", preview.View())
	}
	var keyRow, passwordRow *importer.PreviewRow
	for i := range preview.Rows {
		switch preview.Rows[i].Address {
		case "key.example":
			keyRow = &preview.Rows[i]
		case "password.example":
			passwordRow = &preview.Rows[i]
		}
	}
	if keyRow == nil || passwordRow == nil || keyRow.RowID == oldHostID || preview.Keys[0].Ref == oldKeyID {
		t.Fatalf("ids não foram renovados: host=%+v key=%+v", keyRow, preview.Keys)
	}
	if passwordRow.KeyRef != nil || keyRow.KeyRef == nil || preview.Keys[0].Status != importer.KeyReady {
		t.Fatalf("credenciais incorretas: key=%+v password=%+v", keyRow, passwordRow)
	}
	if keyRow.Extra["legacyAlgorithms"] != true || keyRow.Extra["osIcon"] != "huawei" || keyRow.Extra["profile"] == nil || keyRow.Extra["forwardRules"] == nil {
		t.Fatalf("extra incompleto: %#v", keyRow.Extra)
	}
	if passwordRow.Extra["authMethod"] != string(model.AuthPassword) {
		t.Fatalf("authMethod do host com senha = %#v", passwordRow.Extra)
	}
	if original.Hosts[0].ID != oldHostID {
		t.Fatal("fixture inconsistente")
	}
	viewRaw, err := json.Marshal(preview.View())
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(viewRaw, []byte(original.Credentials[0].PrivateKey)) {
		t.Fatal("prévia serializada expôs a chave privada")
	}
}

func TestLoadOpenHostWithoutKeysFallsBackToPasswordWithoutSecrets(t *testing.T) {
	_, original, _, _ := encryptedOpenHost(t)
	raw, err := exporter.MarshalOpenHost(original, exporter.OpenHostOptions{})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := importer.LoadOpenHost(writeOpenHost(t, raw), nil, model.EmptyContent())
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Rows) != 2 || len(preview.Keys) != 0 {
		t.Fatalf("prévia sem chaves = %+v", preview.View())
	}
	for _, row := range preview.Rows {
		if row.KeyRef != nil {
			t.Fatalf("host manteve chave: %+v", row)
		}
	}
	coordinatorStore, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = coordinatorStore.Close() })
	if err := coordinatorStore.Create("senha-cofre", "senha-cofre"); err != nil {
		t.Fatal(err)
	}
	coordinator := importer.NewCoordinator(coordinatorStore)
	coordinator.SetPreview(preview)
	if _, err := coordinator.Commit(preview.ID, nil); err != nil {
		t.Fatal(err)
	}
	content, _ := coordinatorStore.Read()
	for _, host := range content.Hosts {
		if host.CredentialID != nil || host.AuthMethod == model.AuthKey {
			t.Fatalf("host sem chave importada = %+v", host)
		}
	}
}

func TestCommitOpenHostRestoresProfilesRulesAndCreatesFreshEntityIDs(t *testing.T) {
	raw, original, oldHostID, oldKeyID := encryptedOpenHost(t)
	store, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = store.Close() })
	if err := store.Create("senha-cofre", "senha-cofre"); err != nil {
		t.Fatal(err)
	}
	content, _ := store.Read()
	password := "senha-arquivo"
	preview, err := importer.LoadOpenHost(writeOpenHost(t, raw), &password, content)
	if err != nil {
		t.Fatal(err)
	}
	coordinator := importer.NewCoordinator(store)
	coordinator.SetPreview(preview)
	result, err := coordinator.Commit(preview.ID, nil)
	if err != nil || result.Created != 2 || result.KeysStored != 1 || result.AskPassword != 1 {
		t.Fatalf("Commit = %+v, %v", result, err)
	}
	imported, _ := store.Read()
	if len(imported.Groups) != 2 || imported.Groups[0].ID == original.Groups[0].ID || imported.Groups[0].SortOrder != 3 || imported.Groups[1].SortOrder != 7 {
		t.Fatalf("grupos = %+v", imported.Groups)
	}
	var keyHost, passwordHost *model.Host
	for i := range imported.Hosts {
		switch imported.Hosts[i].Address {
		case "key.example":
			keyHost = &imported.Hosts[i]
		case "password.example":
			passwordHost = &imported.Hosts[i]
		}
	}
	if keyHost == nil || passwordHost == nil || keyHost.ID == oldHostID || keyHost.CredentialID == nil || *keyHost.CredentialID == oldKeyID {
		t.Fatalf("hosts/ids importados = %+v", imported.Hosts)
	}
	if !keyHost.LegacyAlgorithms || keyHost.OSIcon != "huawei" || keyHost.ProfileID == nil || passwordHost.CredentialID != nil {
		t.Fatalf("campos importados = key:%+v password:%+v", keyHost, passwordHost)
	}
	if len(imported.ForwardRules) != 1 || imported.ForwardRules[0].HostID != keyHost.ID || imported.ForwardRules[0].DestPort != 22 {
		t.Fatalf("regras = %+v", imported.ForwardRules)
	}
	profile, err := store.HostProfile(keyHost.ID)
	if err != nil || profile == nil || profile.Name != "Perfil" || profile.ID == original.Hosts[0].ID {
		t.Fatalf("perfil = %+v, %v", profile, err)
	}
}

func TestLoadOpenHostPasswordAndTamperErrors(t *testing.T) {
	raw, _, _, _ := encryptedOpenHost(t)
	path := writeOpenHost(t, raw)
	if _, err := importer.LoadOpenHost(path, nil, model.EmptyContent()); apperr.CodeOf(err) != apperr.FilePasswordRequired {
		t.Fatalf("sem senha = %v", err)
	}
	wrong := "senha-errada"
	if _, err := importer.LoadOpenHost(path, &wrong, model.EmptyContent()); apperr.CodeOf(err) != apperr.FilePasswordWrong {
		t.Fatalf("senha errada = %v", err)
	}

	for _, mutate := range []func(map[string]any){
		func(file map[string]any) { file["version"] = float64(0) },
		func(file map[string]any) { file["kdf"].(map[string]any)["time"] = float64(2) },
		func(file map[string]any) {
			payload, _ := base64.StdEncoding.DecodeString(file["payload"].(string))
			payload[len(payload)-1] ^= 1
			file["payload"] = base64.StdEncoding.EncodeToString(payload)
		},
	} {
		var file map[string]any
		if err := json.Unmarshal(raw, &file); err != nil {
			t.Fatal(err)
		}
		mutate(file)
		tampered, _ := json.Marshal(file)
		if _, err := importer.LoadOpenHost(writeOpenHost(t, tampered), model.Ptr("senha-arquivo"), model.EmptyContent()); apperr.CodeOf(err) != apperr.FilePasswordWrong {
			t.Fatalf("adulteração = %v", err)
		}
	}

	var newer map[string]any
	_ = json.Unmarshal(raw, &newer)
	newer["version"] = float64(exporter.Version + 1)
	newerRaw, _ := json.Marshal(newer)
	if _, err := importer.LoadOpenHost(writeOpenHost(t, newerRaw), model.Ptr("senha-arquivo"), model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportFormatNewer {
		t.Fatalf("versão nova = %v", err)
	}
}

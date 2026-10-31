package importer_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
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
	content.Settings.Environments = append(content.Settings.Environments,
		model.Environment{ID: "noc", Name: "Operação", Color: model.EnvironmentBlue})
	content.Hosts = []model.Host{
		{ID: keyHostID, Label: "Com chave", Address: "key.example", Port: 22, Username: "ops", AuthMethod: model.AuthKey, CredentialID: model.Ptr(key.ID), GroupID: model.Ptr(groupID), EnvironmentID: model.Ptr("noc"), Tags: []string{"olt", "cliente-x"}, Notes: "VLAN 100", LegacyAlgorithms: true, OSIcon: "huawei"},
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
	if !keyHost.LegacyAlgorithms || keyHost.OSIcon != "huawei" || keyHost.ProfileID == nil || passwordHost.CredentialID != nil ||
		keyHost.EnvironmentID == nil || len(keyHost.Tags) != 2 || keyHost.Notes != "VLAN 100" {
		t.Fatalf("campos importados = key:%+v password:%+v", keyHost, passwordHost)
	}
	var importedEnvironment *model.Environment
	for i := range imported.Settings.Environments {
		if imported.Settings.Environments[i].Name == "Operação" {
			importedEnvironment = &imported.Settings.Environments[i]
		}
	}
	if importedEnvironment == nil || *keyHost.EnvironmentID != importedEnvironment.ID || importedEnvironment.Color != model.EnvironmentBlue {
		t.Fatalf("ambiente importado = %+v; host = %+v", importedEnvironment, keyHost)
	}
	if len(imported.ForwardRules) != 1 || imported.ForwardRules[0].HostID != keyHost.ID || imported.ForwardRules[0].DestPort != 22 {
		t.Fatalf("regras = %+v", imported.ForwardRules)
	}
	profile, err := store.HostProfile(keyHost.ID)
	if err != nil || profile == nil || profile.Name != "Perfil" || profile.ID == original.Hosts[0].ID {
		t.Fatalf("perfil = %+v, %v", profile, err)
	}
}

func TestLoadOpenHostVersion1AndStrictFormat(t *testing.T) {
	v1 := []byte(`{"format":"openhost-export","version":1,"encrypted":false,"data":{"groups":[],"hosts":[{"id":"host-v1","label":"Antigo","address":"old.example","port":22,"username":"ops","authMethod":"ask","keyId":null,"groupId":null,"legacyAlgorithms":false,"osIcon":"auto","profile":null}],"forwardRules":[]}}`)
	preview, err := importer.LoadOpenHost(writeOpenHost(t, v1), nil, model.EmptyContent())
	if err != nil || len(preview.Rows) != 1 {
		t.Fatalf("v1 = %+v, %v", preview, err)
	}
	row := preview.Rows[0]
	environment, environmentOK := row.Extra["environment"].(*model.Environment)
	if tags, ok := row.Extra["tags"].([]string); !ok || tags == nil || len(tags) != 0 || row.Extra["notes"] != "" || !environmentOK || environment != nil {
		t.Fatalf("campos padrão da v1 = %#v", row.Extra)
	}

	var unknown map[string]any
	if err := json.Unmarshal(v1, &unknown); err != nil {
		t.Fatal(err)
	}
	unknown["unexpected"] = true
	raw, _ := json.Marshal(unknown)
	if _, err := importer.LoadOpenHost(writeOpenHost(t, raw), nil, model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportUnreadable {
		t.Fatalf("campo desconhecido foi aceito: %v", err)
	}
}

func TestOpenHostEnvironmentLimitWarnsAndLeavesHostUnassigned(t *testing.T) {
	environments := make([]model.Environment, 12)
	colors := []model.EnvironmentColor{model.EnvironmentRed, model.EnvironmentOrange, model.EnvironmentAmber, model.EnvironmentGreen, model.EnvironmentTeal, model.EnvironmentBlue, model.EnvironmentSlate, model.EnvironmentPink}
	for i := range environments {
		environments[i] = model.Environment{ID: domain.NewID(), Name: fmt.Sprintf("Ambiente %d", i+1), Color: colors[i%len(colors)]}
	}
	destination := model.EmptyContent()
	destination.Settings.Environments = environments
	data := exporter.OpenHostData{Groups: []model.Group{}, ForwardRules: []exporter.OpenHostForwardRule{}, Hosts: []exporter.OpenHostHost{{
		ID: "source-host", Label: "Novo", Address: "new.example", Port: 22, Username: "ops", AuthMethod: model.AuthAsk,
		OSIcon: model.OSIconAuto, Tags: []string{}, Environment: &exporter.OpenHostEnvironment{Name: "Décimo terceiro", Color: model.EnvironmentBlue},
	}}}
	raw, err := json.Marshal(exporter.OpenHostFile{Format: exporter.Format, Version: exporter.Version, Data: &data})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := importer.LoadOpenHost(writeOpenHost(t, raw), nil, destination)
	if err != nil || len(preview.Rows) != 1 {
		t.Fatalf("prévia = %+v, %v", preview, err)
	}
	foundWarning := false
	for _, warning := range preview.Rows[0].Warnings {
		foundWarning = foundWarning || warning.Code == importer.WarningEnvironmentLimit
	}
	environment, environmentOK := preview.Rows[0].Extra["environment"].(*model.Environment)
	if !foundWarning || !environmentOK || environment != nil {
		t.Fatalf("limite sem aviso: %+v", preview.Rows[0])
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
	newer["futureField"] = "permitido só para detectar a versão"
	newerRaw, _ := json.Marshal(newer)
	if _, err := importer.LoadOpenHost(writeOpenHost(t, newerRaw), model.Ptr("senha-arquivo"), model.EmptyContent()); apperr.CodeOf(err) != apperr.ImportFormatNewer {
		t.Fatalf("versão nova = %v", err)
	}
}

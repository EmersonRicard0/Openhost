package exporter

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"

	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

func openHostFixture(t *testing.T) (*model.Content, map[string]*model.TerminalProfile, string) {
	t.Helper()
	content := model.EmptyContent()
	rootID, childID := domain.NewID(), domain.NewID()
	content.Groups = []model.Group{
		{ID: rootID, Name: "Clientes", SortOrder: 2},
		{ID: childID, Name: "Norte", ParentID: model.Ptr(rootID), SortOrder: 1},
	}
	key, err := domain.GenerateEd25519(content, "Chave Norte", model.Ptr("frase-chave"), domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	password, err := domain.CreatePassword(content, "Senha legado", "segredo-servidor", domain.Now())
	if err != nil {
		t.Fatal(err)
	}
	keyHostID, passwordHostID := domain.NewID(), domain.NewID()
	detected := "linux"
	content.Hosts = []model.Host{
		{ID: keyHostID, Label: "OLT Norte", Address: "olt.example", Port: 2222, Username: "ops", AuthMethod: model.AuthKey, CredentialID: model.Ptr(key.ID), GroupID: model.Ptr(childID), LegacyAlgorithms: true, OSIcon: "huawei", DetectedOS: &detected},
		{ID: passwordHostID, Label: "Servidor", Address: "srv.example", Port: 22, Username: "root", AuthMethod: model.AuthPassword, CredentialID: model.Ptr(password.ID), GroupID: model.Ptr(rootID), OSIcon: model.OSIconAuto},
	}
	content.ForwardRules = []model.ForwardRule{{ID: domain.NewID(), HostID: keyHostID, Label: model.Ptr("Banco"), BindAddress: "127.0.0.1", BindPort: 15432, DestHost: "db.internal", DestPort: 5432}}
	profile := model.TerminalProfile{ID: domain.NewID(), Name: "NOC", FontFamily: "JetBrains Mono", FontSize: 15, FontWeight: 400, FontWeightBold: 700, LineHeight: 1.3, Ligatures: true, CursorStyle: model.CursorBar, CursorBlink: true, Scrollback: 20000, BackgroundOpacity: .9, Blur: 4, Padding: 10, ColorSchemeID: vault.BrandSchemeID}
	return content, map[string]*model.TerminalProfile{keyHostID: &profile}, key.PrivateKey
}

func TestMarshalOpenHostWithoutKeysHasPlainDataAndNoSecrets(t *testing.T) {
	content, profiles, privateKey := openHostFixture(t)
	raw, err := MarshalOpenHost(content, OpenHostOptions{Profiles: profiles, Now: func() time.Time { return time.Date(2026, 10, 26, 12, 0, 0, 0, time.UTC) }, AppVersion: "0.3.0"})
	if err != nil {
		t.Fatal(err)
	}
	for _, secret := range [][]byte{[]byte(privateKey), []byte("frase-chave"), []byte("segredo-servidor"), []byte("linux")} {
		if bytes.Contains(raw, secret) {
			t.Fatalf("arquivo sem chaves contém segredo ou detectedOs: %q", secret)
		}
	}
	var file struct {
		Format    string          `json:"format"`
		Version   int             `json:"version"`
		Encrypted bool            `json:"encrypted"`
		Data      json.RawMessage `json:"data"`
		Payload   string          `json:"payload"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if file.Format != Format || file.Version != Version || file.Encrypted || len(file.Data) == 0 || file.Payload != "" {
		t.Fatalf("cabeçalho inesperado: %+v", file)
	}
	if !bytes.Contains(file.Data, []byte(`"legacyAlgorithms":true`)) || !bytes.Contains(file.Data, []byte(`"profile":`)) || !bytes.Contains(file.Data, []byte(`"forwardRules":`)) {
		t.Fatalf("dados incompletos: %s", file.Data)
	}
}

func TestMarshalOpenHostWithKeysEncryptsAllData(t *testing.T) {
	content, profiles, privateKey := openHostFixture(t)
	raw, err := MarshalOpenHost(content, OpenHostOptions{Profiles: profiles, IncludeKeys: true, FilePassword: "senha-arquivo", KDF: vault.TestKDF})
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte(privateKey)) || bytes.Contains(raw, []byte("frase-chave")) || bytes.Contains(raw, []byte("OLT Norte")) {
		t.Fatal("arquivo cifrado expôs dados")
	}
	var file struct {
		Encrypted bool            `json:"encrypted"`
		KDF       json.RawMessage `json:"kdf"`
		Data      json.RawMessage `json:"data"`
		Payload   string          `json:"payload"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		t.Fatal(err)
	}
	if !file.Encrypted || len(file.KDF) == 0 || len(file.Data) != 0 || file.Payload == "" || !bytes.Contains(file.KDF, []byte(`"alg":"argon2id"`)) {
		t.Fatalf("envelope cifrado inesperado: %+v", file)
	}
}

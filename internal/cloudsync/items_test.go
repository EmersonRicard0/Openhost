package cloudsync

import (
	"encoding/json"
	"reflect"
	"testing"

	"shellvault/internal/appwin"
	"shellvault/internal/model"
)

func TestItemsRoundTripAndStableHashes(t *testing.T) {
	groupID := "11111111-2222-4333-8444-555555555555"
	hostID := "22222222-3333-4444-8555-666666666666"
	credentialID := "33333333-4444-4555-8666-777777777777"
	knownID := "44444444-5555-4666-8777-888888888888"
	forwardID := "55555555-6666-4777-8888-999999999999"
	profileID := "66666666-7777-4888-8999-aaaaaaaaaaaa"
	schemeID := "77777777-8888-4999-8aaa-bbbbbbbbbbbb"
	content := model.EmptyContent()
	content.Groups = []model.Group{{ID: groupID, Name: "NOC", SortOrder: 1}}
	content.Credentials = []model.Credential{{ID: credentialID, Kind: model.CredentialPassword, Name: "Senha", Password: "segredo", CreatedAt: "2026-10-27T12:00:00Z"}}
	content.Hosts = []model.Host{{ID: hostID, Label: "Roteador", Address: "10.0.0.1", Port: 22, Username: "admin", AuthMethod: model.AuthPassword, CredentialID: &credentialID, GroupID: &groupID, ProfileID: &profileID, OSIcon: model.OSIconAuto, CreatedAt: "2026-10-27T12:00:00Z", UpdatedAt: "2026-10-27T12:00:00Z"}}
	content.KnownHosts = []model.KnownHost{{ID: knownID, Endpoint: "10.0.0.1:22", KeyType: "ssh-ed25519", Fingerprint: "SHA256:abc", AcceptedAt: "2026-10-27T12:00:00Z"}}
	content.ForwardRules = []model.ForwardRule{{ID: forwardID, HostID: hostID, BindAddress: "127.0.0.1", BindPort: 2200, DestHost: "db.local", DestPort: 5432}}
	scheme := model.ColorScheme{ID: schemeID, Name: "Teste", Origin: model.SchemeCustom, Foreground: "#ffffff", Background: "#000000", Cursor: "#ffffff", Selection: "#11223344", ANSI: []string{"#000000", "#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777", "#888888", "#999999", "#aaaaaa", "#bbbbbb", "#cccccc", "#dddddd", "#eeeeee", "#ffffff"}}
	profile := model.TerminalProfile{ID: profileID, Name: "Perfil", FontFamily: "Mono", FontSize: 14, FontWeight: 400, FontWeightBold: 700, LineHeight: 1.2, CursorStyle: model.CursorBlock, Scrollback: 10000, BackgroundOpacity: 1, Padding: 12, ColorSchemeID: schemeID}
	prefs := appwin.DefaultPreferences()
	prefs.Shortcuts = map[string]string{"newTab": "Ctrl+T", "search": "Ctrl+F"}
	prefs.CopyOnSelect, prefs.RightClickPaste, prefs.AutoReconnect = true, false, true
	data := SyncData{Content: content, Profiles: []model.TerminalProfile{profile}, Schemes: []model.ColorScheme{scheme}, Preferences: SyncPreferencesFrom(prefs)}

	items, err := EncodeItems(data)
	if err != nil {
		t.Fatal(err)
	}
	itemsAgain, err := EncodeItems(data)
	if err != nil || !reflect.DeepEqual(items, itemsAgain) {
		t.Fatalf("hash/ordem instável: %v", err)
	}
	decoded, rejected, err := DecodeItems(items)
	if err != nil || len(rejected) != 0 {
		t.Fatalf("DecodeItems = rejected %v, err %v", rejected, err)
	}
	if !reflect.DeepEqual(decoded.Content, content) || !reflect.DeepEqual(decoded.Profiles, data.Profiles) || !reflect.DeepEqual(decoded.Schemes, data.Schemes) || !reflect.DeepEqual(decoded.Preferences, data.Preferences) {
		t.Fatalf("roundtrip divergente:\nwant=%+v\ngot=%+v", data, decoded)
	}
}

func TestSyncPreferencesExcludeMachineLocalFields(t *testing.T) {
	preferences := appwin.DefaultPreferences()
	preferences.Theme = "dark"
	preferences.TerminalFontFamily = "Fonte só desta máquina"
	preferences.DefaultShell = "shell-local"
	preferences.Updates.Skipped = "9.9.9"
	preferences.Shortcuts = map[string]string{"newTab": "Ctrl+T"}
	encoded, err := json.Marshal(SyncPreferencesFrom(preferences))
	if err != nil {
		t.Fatal(err)
	}
	for _, local := range []string{"dark", "Fonte só desta máquina", "shell-local", "9.9.9", "updates"} {
		if string(encoded) == local || containsJSONText(encoded, local) {
			t.Fatalf("preferência local %q entrou no item: %s", local, encoded)
		}
	}
	base := appwin.DefaultPreferences()
	base.Theme = "light"
	base.DefaultShell = "cmd"
	merged := ApplySyncPreferences(base, SyncPreferencesFrom(preferences))
	if merged.Theme != "light" || merged.DefaultShell != "cmd" || merged.Shortcuts["newTab"] != "Ctrl+T" {
		t.Fatalf("preferências aplicadas incorretamente: %+v", merged)
	}
}

func TestDecodeItemsRejectsInvalidCloudItem(t *testing.T) {
	bad := PlainItem{Key: "host:22222222-3333-4444-8555-666666666666", Data: json.RawMessage(`{"id":"22222222-3333-4444-8555-666666666666","label":"Host","address":"example.com","port":0,"username":"u","authMethod":"ask","credentialId":null,"groupId":null,"legacyAlgorithms":false,"profileId":null,"detectedOs":null,"osIcon":"auto","createdAt":"2026-10-27T12:00:00Z","updatedAt":"2026-10-27T12:00:00Z"}`)}
	bad.Hash = StableItemHash(bad.Data)
	decoded, rejected, err := DecodeItems([]PlainItem{bad})
	if err != nil || len(rejected) != 1 || len(decoded.Content.Hosts) != 0 {
		t.Fatalf("item inválido = decoded %+v rejected %v err %v", decoded, rejected, err)
	}
}

func containsJSONText(data []byte, value string) bool {
	var decoded any
	_ = json.Unmarshal(data, &decoded)
	return containsValue(decoded, value)
}

func containsValue(value any, want string) bool {
	switch item := value.(type) {
	case string:
		return item == want
	case []any:
		for _, child := range item {
			if containsValue(child, want) {
				return true
			}
		}
	case map[string]any:
		for key, child := range item {
			if key == want || containsValue(child, want) {
				return true
			}
		}
	}
	return false
}

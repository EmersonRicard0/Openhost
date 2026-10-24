package bridge

import (
	"context"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

func testServices(t *testing.T) *Services {
	t.Helper()
	services, err := newServices(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { services.Shutdown(nil) })
	return services
}

func TestAppServicePreferencesAndExternalURL(t *testing.T) {
	services := testServices(t)
	app := services.appService

	preferences, err := app.GetPreferences()
	if err != nil || preferences.DefaultShell != "powershell" || !preferences.GlassEnabled {
		t.Fatalf("preferências %+v, %v", preferences, err)
	}
	groupID := "4ce66518-3068-4bef-ad0b-eb3f0141443d"
	updated, err := app.UpdatePreferences(PreferencesPatch{
		"theme":           "light",
		"glassEnabled":    false,
		"defaultShell":    "cmd",
		"collapsedGroups": []any{groupID},
	})
	if err != nil || updated.Theme != "light" || updated.GlassEnabled || updated.DefaultShell != "cmd" || len(updated.CollapsedGroups) != 1 {
		t.Fatalf("preferências atualizadas %+v, %v", updated, err)
	}
	wantBridgeCode(t, func() error {
		_, err := app.UpdatePreferences(PreferencesPatch{"defaultShell": "bash"})
		return err
	}(), apperr.InvalidInput)

	var opened string
	app.openURL = func(_ context.Context, url string) { opened = url }
	if err := app.OpenExternalUrl("https://example.com/docs"); err != nil || opened == "" {
		t.Fatalf("url %q, %v", opened, err)
	}
	wantBridgeCode(t, app.OpenExternalUrl("file:///C:/segredo"), apperr.InvalidInput)
}

func wantBridgeCode(t *testing.T, err error, code apperr.Code) {
	t.Helper()
	if got := apperr.CodeOf(err); got != code {
		t.Fatalf("erro %v (%s), esperado %s", err, got, code)
	}
	if _, ok := err.(*apperr.Error); err != nil && !ok {
		t.Fatalf("erro não sanitizado: %T", err)
	}
}

func TestCoreServicesVaultAndDomain(t *testing.T) {
	services := testServices(t)
	vaultService := services.vaultService
	hostService := services.hostService
	credentialService := services.credentialService

	status, err := vaultService.GetStatus()
	if err != nil || status.State != vault.StateNonexistent {
		t.Fatalf("status %+v, %v", status, err)
	}
	if err := vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	autoLock := 7
	settings, err := vaultService.UpdateSettings(VaultSettingsPatch{
		"autoLockMinutes":       autoLock,
		"connectTimeoutSeconds": 20,
		"keepaliveSeconds":      45,
	})
	if err != nil || settings.AutoLockMinutes == nil || *settings.AutoLockMinutes != 7 || settings.ConnectTimeoutSeconds != 20 || settings.KeepaliveSeconds != 45 {
		t.Fatalf("settings %+v, %v", settings, err)
	}

	credential, err := credentialService.CreatePassword("Senha NOC", "segredo")
	if err != nil {
		t.Fatal(err)
	}
	group, err := hostService.CreateGroup("Datacenter", nil)
	if err != nil {
		t.Fatal(err)
	}
	host, err := hostService.Create(domain.HostInput{
		Label: "Roteador", Address: "127.0.0.1", Port: 22, Username: "noc",
		AuthMethod: model.AuthPassword, CredentialID: &credential.ID, GroupID: &group.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if host.CredentialName == nil || *host.CredentialName != "Senha NOC" {
		t.Fatalf("host %+v", host)
	}
	listed, err := hostService.List()
	if err != nil || len(listed) != 1 || listed[0].ID != host.ID {
		t.Fatalf("hosts %+v, %v", listed, err)
	}

	wantBridgeCode(t, credentialService.Remove(credential.ID), apperr.InvalidInput)
	wantBridgeCode(t, hostService.Remove("id-inválido"), apperr.InvalidInput)
	if err := hostService.Remove(host.ID); err != nil {
		t.Fatal(err)
	}
	if err := credentialService.Remove(credential.ID); err != nil {
		t.Fatal(err)
	}
}

func TestSessionServiceLocalLifecycle(t *testing.T) {
	services := testServices(t)
	sessions := services.sessionService

	opened, err := sessions.OpenLocal("cmd")
	if err != nil {
		t.Fatal(err)
	}
	summary, err := sessions.ActiveSummary()
	if err != nil || summary.Sessions != 1 || summary.Transfers != 0 || summary.Forwards != 0 {
		t.Fatalf("resumo %+v, %v", summary, err)
	}
	if err := sessions.Close(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	if services.sessions.Count() != 0 {
		t.Fatal("sessão local não foi removida")
	}
	_, err = sessions.OpenLocal("bash")
	wantBridgeCode(t, err, apperr.InvalidInput)
	wantBridgeCode(t, sessions.SendKeys(opened.SessionID, "ctrl+x"), apperr.InvalidInput)
}

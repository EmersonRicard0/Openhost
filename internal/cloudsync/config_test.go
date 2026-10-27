package cloudsync

import "testing"

func TestCredentialsPreferBuildValues(t *testing.T) {
	oldID, oldSecret := ClientID, ClientSecret
	t.Cleanup(func() { ClientID, ClientSecret = oldID, oldSecret })
	t.Setenv("OPENHOST_GOOGLE_CLIENT_ID", "env-id")
	t.Setenv("OPENHOST_GOOGLE_CLIENT_SECRET", "env-secret")
	ClientID, ClientSecret = "build-id", "build-secret"

	credentials := Credentials()
	if credentials.ClientID != "build-id" || credentials.ClientSecret != "build-secret" {
		t.Fatalf("credenciais do build não prevaleceram: %+v", credentials)
	}
	if !Available() {
		t.Fatal("client id do build deveria disponibilizar a sincronização")
	}
}

func TestCredentialsFallBackToEnvironment(t *testing.T) {
	oldID, oldSecret := ClientID, ClientSecret
	t.Cleanup(func() { ClientID, ClientSecret = oldID, oldSecret })
	ClientID, ClientSecret = "", ""
	t.Setenv("OPENHOST_GOOGLE_CLIENT_ID", "env-id")
	t.Setenv("OPENHOST_GOOGLE_CLIENT_SECRET", "env-secret")

	credentials := Credentials()
	if credentials.ClientID != "env-id" || credentials.ClientSecret != "env-secret" {
		t.Fatalf("credenciais do ambiente não foram lidas: %+v", credentials)
	}
	if !Available() {
		t.Fatal("client id do ambiente deveria disponibilizar a sincronização")
	}
}

func TestUnavailableWithoutClientID(t *testing.T) {
	oldID, oldSecret := ClientID, ClientSecret
	t.Cleanup(func() { ClientID, ClientSecret = oldID, oldSecret })
	ClientID, ClientSecret = "", ""
	t.Setenv("OPENHOST_GOOGLE_CLIENT_ID", "")
	t.Setenv("OPENHOST_GOOGLE_CLIENT_SECRET", "não basta sozinho")
	if Available() {
		t.Fatal("sincronização deveria ficar indisponível sem client id")
	}
}

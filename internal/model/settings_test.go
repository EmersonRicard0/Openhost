package model

import (
	"reflect"
	"testing"
)

func TestNormalizeVaultSettingsFillsFieldsMissingFromOlderVault(t *testing.T) {
	settings := NormalizeVaultSettings(VaultSettings{})
	if settings.ConnectTimeoutSeconds != 15 || settings.KeepaliveSeconds != 30 ||
		settings.LegacyDefault || settings.Term != DefaultTerm {
		t.Fatalf("configurações normalizadas = %+v", settings)
	}
	for _, term := range []string{"xterm-256color", "xterm", "vt100", "linux"} {
		if !ValidTerm(term) {
			t.Errorf("TERM válido rejeitado: %s", term)
		}
	}
	if ValidTerm("screen") {
		t.Fatal("TERM fora do contrato foi aceito")
	}
	want := []Environment{
		{ID: "prod", Name: "Produção", Color: "red"},
		{ID: "staging", Name: "Homologação", Color: "amber"},
		{ID: "lab", Name: "Laboratório", Color: "green"},
		{ID: "customer", Name: "Cliente", Color: "slate"},
	}
	if !reflect.DeepEqual(settings.Environments, want) {
		t.Fatalf("ambientes padrão = %+v", settings.Environments)
	}

	empty := NormalizeVaultSettings(VaultSettings{Environments: []Environment{}})
	if empty.Environments == nil || len(empty.Environments) != 0 {
		t.Fatalf("lista vazia não foi preservada: %+v", empty.Environments)
	}
}

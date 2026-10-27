package bridge

import (
	"errors"
	"strings"
	"testing"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/sshx"
)

func TestShouldProbeOSRelease(t *testing.T) {
	tests := []struct {
		name, version, banner, current string
		want                           bool
	}{
		{"genérico desconhecido", "SSH-2.0-OpenSSH_9.6", "", "", true},
		{"dropbear genérico", "SSH-2.0-dropbear_2024.86", "", "linux", true},
		{"fabricante na versão", "SSH-2.0-JUNOS", "", "", false},
		{"fabricante no pré-login", "SSH-2.0-OpenSSH_9.6", "JUNOS 23.4", "", false},
		{"fabricante já conhecido", "SSH-2.0-OpenSSH_9.6", "", "juniper", false},
		{"datacom já conhecido", "SSH-2.0-OpenSSH_9.6", "", "datacom", false},
		{"servidor identificado", "SSH-2.0-OpenSSH Ubuntu", "", "", false},
		{"servidor não sondável", "SSH-2.0-Apache-SSHD", "", "", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := shouldProbeOSRelease(test.version, test.banner, test.current); got != test.want {
				t.Fatalf("shouldProbeOSRelease() = %v, esperado %v", got, test.want)
			}
		})
	}
}

func TestOpenQuickValidatesEachTargetField(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, field string
		target      QuickTarget
	}{
		{"address", "address", QuickTarget{Address: "router.invalid!", Port: 22, Username: "ops"}},
		{"bracketed IPv6", "address", QuickTarget{Address: "[2001:db8::1]", Port: 22, Username: "ops"}},
		{"port low", "port", QuickTarget{Address: "router.example", Port: 0, Username: "ops"}},
		{"port high", "port", QuickTarget{Address: "router.example", Port: 65536, Username: "ops"}},
		{"username empty", "username", QuickTarget{Address: "router.example", Port: 22, Username: ""}},
		{"username space", "username", QuickTarget{Address: "router.example", Port: 22, Username: "op s"}},
		{"username control", "username", QuickTarget{Address: "router.example", Port: 22, Username: "ops\u0007"}},
		{"username long", "username", QuickTarget{Address: "router.example", Port: 22, Username: strings.Repeat("u", 65)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := services.sessionService.OpenQuick(tc.target)
			var appErr *apperr.Error
			if !errors.As(err, &appErr) || appErr.Code != apperr.InvalidInput || !strings.Contains(appErr.Detail, "field: "+tc.field) {
				t.Fatalf("erro = %#v; esperado field %q", err, tc.field)
			}
		})
	}
	if services.sessions.Count() != 0 {
		t.Fatal("alvo inválido criou sessão")
	}
}

func TestOpenQuickUsesVaultOptionsWithoutSavingHostOrPassword(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	if _, err := services.vaultService.UpdateSettings(VaultSettingsPatch{
		"legacyDefault": true, "connectTimeoutSeconds": 42, "keepaliveSeconds": 50, "term": "linux",
	}); err != nil {
		t.Fatal(err)
	}
	opts, err := services.sessionService.quickOptions(QuickTarget{Address: "2001:DB8::1", Port: 2222, Username: "ops"})
	if err != nil {
		t.Fatal(err)
	}
	if opts.Address != "2001:db8::1" || opts.Port != 2222 || opts.Username != "ops" ||
		opts.Auth.Method != model.AuthAsk || opts.Auth.Password != "" || !opts.AgentFirst ||
		!opts.LegacyAlgorithms || opts.ConnectTimeout != 42*time.Second || opts.Keepalive != 50*time.Second ||
		opts.Term != "linux" || opts.KnownHosts == nil {
		t.Fatalf("opções rápidas inesperadas: %+v", opts)
	}

	opened, err := services.sessionService.OpenQuick(QuickTarget{Address: "127.0.0.1", Port: 1, Username: "ops"})
	if err != nil {
		t.Fatal(err)
	}
	session, err := services.sessions.Get(opened.SessionID)
	if err != nil || session.HostID != nil {
		t.Fatalf("sessão rápida associada a host: %+v, %v", session, err)
	}
	if err := services.sessionService.Close(opened.SessionID); err != nil {
		t.Fatal(err)
	}
	content, err := services.store.Read()
	if err != nil || len(content.Hosts) != 0 || len(content.Credentials) != 0 {
		t.Fatalf("conexão rápida gravou host ou credencial: %+v, %v", content, err)
	}
}

func TestDialDoesNotWaitForDetection(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	host, err := services.hostService.Create(domain.HostInput{
		Label: "Servidor", Address: "localhost", Port: 22, Username: "ops", AuthMethod: model.AuthAsk,
	})
	if err != nil {
		t.Fatal(err)
	}
	events := make(chan HostsChangedEvent, 1)
	services.sessionService.emit = func(name string, payload any) {
		if name == EventHostsChanged {
			events <- payload.(HostsChangedEvent)
		}
	}
	started := make(chan struct{})
	release := make(chan struct{})
	begin := time.Now()
	startHostDetection(func() {
		close(started)
		<-release
		_ = services.sessionService.recordDetectedOS(host.ID, domain.OSUbuntu)
	})
	if elapsed := time.Since(begin); elapsed >= 200*time.Millisecond {
		t.Fatalf("início da detecção bloqueou por %v", elapsed)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("detecção não iniciou")
	}
	select {
	case event := <-events:
		t.Fatalf("evento chegou antes da detecção terminar: %+v", event)
	default:
	}
	close(release)
	select {
	case event := <-events:
		if event.DetectedOS == nil || *event.DetectedOS != domain.OSUbuntu {
			t.Fatalf("evento = %+v", event)
		}
	case <-time.After(time.Second):
		t.Fatal("evento tardio não chegou")
	}
}

func TestBackgroundDetectionPreservesLinuxDistribution(t *testing.T) {
	got := sshx.ResolveOS(sshx.Signals{
		Version:        "SSH-2.0-OpenSSH_9.6",
		Terminal:       []byte("Cisco IOS Software"),
		OSRelease:      "ID=ubuntu\nID_LIKE=debian\n",
		ProbeOSRelease: true,
	})
	if got != "ubuntu" {
		t.Fatalf("distribuição = %q, esperado ubuntu", got)
	}
}

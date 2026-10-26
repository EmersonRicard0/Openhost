package bridge

import (
	"testing"
	"time"

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

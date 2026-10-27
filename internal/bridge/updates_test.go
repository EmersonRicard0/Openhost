package bridge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/updater"
)

func prepareUpdateService(t *testing.T, server *httptest.Server) (*Services, *UpdateService) {
	t.Helper()
	services := testServices(t)
	service := services.updateService
	service.current = "0.5.0"
	service.install = updater.Install{Kind: updater.InstallNSIS, Writable: true}
	service.goos = "windows"
	service.goarch = "amd64"
	service.config.ReleasesURL = server.URL
	service.config.Client = server.Client()
	service.config.UserAgent = "OpenHost/0.5.0"
	service.emit = func(string, any) {}
	return services, service
}

func TestUpdateServiceCheckRemindSkipAndPrefs(t *testing.T) {
	var mu sync.Mutex
	version := "0.6.0"
	var requests int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		requests++
		name := "OpenHost-" + version + "-windows-amd64-installer.exe"
		w.Header().Set("ETag", `"release-`+version+`"`)
		_, _ = fmt.Fprintf(w, `[{"tag_name":"v%s","body":"Notas %s","assets":[{"name":"%s","size":123,"browser_download_url":"%s/%s"}]}]`, version, version, name, serverURL(r), name)
	}))
	defer server.Close()

	services, service := prepareUpdateService(t, server)
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	service.now = func() time.Time { return now }
	var events []UpdateStateEvent
	service.emit = func(name string, payload any) {
		if name != EventUpdatesState {
			t.Errorf("evento = %q", name)
		}
		events = append(events, payload.(UpdateStateEvent))
	}

	info, err := service.Check(true)
	if err != nil || info.Latest == nil || *info.Latest != "0.6.0" || info.State != UpdateAvailable || !info.Notify || info.Install != "nsis" || !info.OneClick || info.CheckedAt != "2026-10-27T12:00:00Z" {
		t.Fatalf("check = %+v, %v", info, err)
	}
	if len(events) != 2 || events[0].State != UpdateChecking || events[1].State != UpdateAvailable || events[1].Version != "0.6.0" {
		t.Fatalf("eventos = %+v", events)
	}
	if err := service.Remind(); err != nil {
		t.Fatal(err)
	}
	if info, _ := service.Info(); info.Notify {
		t.Fatalf("lembrar depois não ocultou: %+v", info)
	}
	now = now.Add(25 * time.Hour)
	if info, _ := service.Info(); !info.Notify {
		t.Fatalf("aviso não voltou depois de 24h: %+v", info)
	}
	if err := service.Skip("9.9.9"); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("skip diferente = %v", err)
	}
	if err := service.Skip("0.6.0"); err != nil {
		t.Fatal(err)
	}
	if info, _ := service.Info(); info.Notify {
		t.Fatalf("versão pulada notificou: %+v", info)
	}

	mu.Lock()
	version = "0.7.0"
	mu.Unlock()
	info, err = service.Check(true)
	if err != nil || info.Latest == nil || *info.Latest != "0.7.0" || !info.Notify {
		t.Fatalf("versão maior depois do skip = %+v, %v", info, err)
	}
	prefs, err := service.SetPrefs(UpdatePrefs{Auto: false, Prerelease: true})
	if err != nil || prefs.Auto || !prefs.Prerelease {
		t.Fatalf("prefs = %+v, %v", prefs, err)
	}
	mu.Lock()
	before := requests
	mu.Unlock()
	if _, err := service.Check(false); err != nil {
		t.Fatalf("check automático desligado = %v", err)
	}
	mu.Lock()
	after := requests
	mu.Unlock()
	if after != before {
		t.Fatalf("check automático desligado fez %d requisições", after-before)
	}
	stored, err := services.appService.GetPreferences()
	if err != nil || stored.Updates.Auto || !stored.Updates.Prerelease || stored.Updates.Skipped != "0.6.0" || stored.Updates.LastCheck == "" || stored.Updates.ETag == "" {
		t.Fatalf("prefs persistidas = %+v, %v", stored.Updates, err)
	}
}

func TestUpdateServiceManualErrorsAndAutomaticFailureIsSilent(t *testing.T) {
	var status atomic.Int64
	status.Store(http.StatusInternalServerError)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(int(status.Load()))
	}))
	defer server.Close()
	_, service := prepareUpdateService(t, server)
	var events []UpdateStateEvent
	service.emit = func(_ string, payload any) { events = append(events, payload.(UpdateStateEvent)) }

	info, err := service.Check(false)
	if err != nil || info.State != UpdateIdle || info.Reason != nil {
		t.Fatalf("falha automática = %+v, %v", info, err)
	}
	for _, event := range events {
		if event.State == UpdateFailed {
			t.Fatalf("falha automática exposta: %+v", events)
		}
	}

	status.Store(http.StatusTooManyRequests)
	_, err = service.Check(true)
	if apperr.CodeOf(err) != apperr.RateLimited {
		t.Fatalf("429 = %v", err)
	}
	var appError *apperr.Error
	if !errors.As(err, &appError) || appError.Op != "UpdateService.Check" {
		t.Fatalf("operação do erro = %+v", appError)
	}
	info, _ = service.Info()
	if info.State != UpdateFailed || info.Reason == nil || *info.Reason != UpdateFailureNetwork {
		t.Fatalf("falha manual limitada = %+v", info)
	}

	status.Store(http.StatusInternalServerError)
	_, err = service.Check(true)
	if apperr.CodeOf(err) != apperr.Network {
		t.Fatalf("500 = %v", err)
	}
}

func TestUpdateServiceStartsOnlyAfterDomReadyAndChecksPeriodically(t *testing.T) {
	var requests atomic.Int64
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()
	services, service := prepareUpdateService(t, server)
	service.checkInterval = 20 * time.Millisecond

	time.Sleep(40 * time.Millisecond)
	if requests.Load() != 0 {
		t.Fatalf("verificou antes da janela pronta: %d", requests.Load())
	}
	ctx, cancel := context.WithCancel(context.Background())
	services.DomReady(ctx)
	t.Cleanup(cancel)
	deadline := time.Now().Add(time.Second)
	for requests.Load() < 2 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if requests.Load() < 2 {
		t.Fatalf("verificação inicial/periódica ausente: %d", requests.Load())
	}
}

func TestUpdateCheckDoesNotOverwriteConcurrentUIPreferences(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		_, _ = w.Write([]byte(`[]`))
	}))
	defer server.Close()
	services, service := prepareUpdateService(t, server)
	done := make(chan error, 1)
	go func() {
		_, err := service.Check(true)
		done <- err
	}()
	<-started
	if _, err := services.appService.UpdatePreferences(PreferencesPatch{"theme": "dark"}); err != nil {
		t.Fatal(err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	preferences, err := services.appService.GetPreferences()
	if err != nil || preferences.Theme != "dark" || preferences.Updates.LastCheck == "" {
		t.Fatalf("preferências concorrentes = %+v, %v", preferences, err)
	}
}

func TestUpdateStateEventJSON(t *testing.T) {
	reason := UpdateFailureNetwork
	payload, err := json.Marshal(UpdateStateEvent{State: UpdateFailed, Version: "0.6.0", Reason: &reason})
	if err != nil {
		t.Fatal(err)
	}
	if string(payload) != `{"state":"failed","version":"0.6.0","reason":"network"}` {
		t.Fatalf("payload = %s", payload)
	}
}

func serverURL(r *http.Request) string {
	return "http://" + r.Host
}

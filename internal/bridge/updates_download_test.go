package bridge

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"shellvault/internal/updater"
)

func TestUpdateServiceDownloadVerifiesAndBecomesReady(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	name := "OpenHost-0.6.0-windows-amd64-installer.exe"
	packageData := []byte("pacote assinado da atualização")
	digest := sha256.Sum256(packageData)
	sums := []byte(fmt.Sprintf("%s  %s\n", hex.EncodeToString(digest[:]), name))
	signature := []byte(base64.StdEncoding.EncodeToString(ed25519.Sign(privateKey, sums)))

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/releases":
			base := "http://" + r.Host
			_, _ = fmt.Fprintf(w, `[{"tag_name":"v0.6.0","body":"Notas","assets":[`+
				`{"name":%q,"size":%d,"browser_download_url":%q},`+
				`{"name":"SHA256SUMS.txt","size":%d,"browser_download_url":%q},`+
				`{"name":"SHA256SUMS.txt.sig","size":%d,"browser_download_url":%q}]}]`,
				name, len(packageData), base+"/package", len(sums), base+"/sums", len(signature), base+"/signature")
		case "/package":
			_, _ = w.Write(packageData)
		case "/sums":
			_, _ = w.Write(sums)
		case "/signature":
			_, _ = w.Write(signature)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	services, service := prepareUpdateService(t, server)
	service.config.ReleasesURL = server.URL + "/releases"
	service.config.PublicKey = publicKey
	if _, err := service.Check(true); err != nil {
		t.Fatal(err)
	}
	ready := make(chan UpdateStateEvent, 1)
	service.emit = func(_ string, payload any) {
		event := payload.(UpdateStateEvent)
		if event.State == UpdateReady {
			ready <- event
		}
	}
	if err := service.Download(); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-ready:
		if event.Version != "0.6.0" {
			t.Fatalf("ready = %+v", event)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("download não chegou a ready")
	}
	info, err := service.Info()
	if err != nil || info.State != UpdateReady || info.Progress != nil || info.Reason != nil {
		t.Fatalf("info = %+v, %v", info, err)
	}
	if _, err := os.Stat(filepath.Join(services.dataDir, "updates", "0.6.0", name)); err != nil {
		t.Fatalf("pacote verificado ausente: %v", err)
	}
}

func TestUpdateServiceRejectsBadSignatureAndCancelReturnsAvailable(t *testing.T) {
	publicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	name := "OpenHost-0.6.0-windows-amd64-installer.exe"
	packageData := []byte("pacote")
	digest := sha256.Sum256(packageData)
	sums := []byte(fmt.Sprintf("%s  %s\n", hex.EncodeToString(digest[:]), name))
	badSignature := []byte(base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize)))
	blockPackage := make(chan struct{})
	var blocking bool
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		base := "http://" + r.Host
		switch r.URL.Path {
		case "/releases":
			_, _ = fmt.Fprintf(w, `[{"tag_name":"v0.6.0","assets":[`+
				`{"name":%q,"size":%d,"browser_download_url":%q},`+
				`{"name":"SHA256SUMS.txt","size":%d,"browser_download_url":%q},`+
				`{"name":"SHA256SUMS.txt.sig","size":%d,"browser_download_url":%q}]}]`,
				name, len(packageData), base+"/package", len(sums), base+"/sums", len(badSignature), base+"/signature")
		case "/package":
			mu.Lock()
			wait := blocking
			mu.Unlock()
			if wait {
				w.Header().Set("Content-Length", fmt.Sprint(len(packageData)))
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
				}
				<-blockPackage
				return
			}
			_, _ = w.Write(packageData)
		case "/sums":
			_, _ = w.Write(sums)
		case "/signature":
			_, _ = w.Write(badSignature)
		}
	}))
	defer server.Close()

	_, service := prepareUpdateService(t, server)
	service.config.ReleasesURL = server.URL + "/releases"
	service.config.PublicKey = publicKey
	if _, err := service.Check(true); err != nil {
		t.Fatal(err)
	}
	failed := make(chan UpdateStateEvent, 1)
	service.emit = func(_ string, payload any) {
		event := payload.(UpdateStateEvent)
		if event.State == UpdateFailed {
			failed <- event
		}
	}
	if err := service.Download(); err != nil {
		t.Fatal(err)
	}
	select {
	case event := <-failed:
		if event.Reason == nil || *event.Reason != UpdateFailureSignature {
			t.Fatalf("falha = %+v", event)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("assinatura inválida não falhou")
	}

	mu.Lock()
	blocking = true
	mu.Unlock()
	if err := service.Download(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(50 * time.Millisecond)
	if err := service.Cancel(); err != nil {
		t.Fatal(err)
	}
	close(blockPackage)
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		info, _ := service.Info()
		if info.State == UpdateAvailable {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("cancelamento não voltou para available")
}

func TestUpdateServiceApplyControlsFolderAndLastResult(t *testing.T) {
	services := testServices(t)
	service := services.updateService
	versionDir := filepath.Join(services.dataDir, "updates", "0.6.0")
	if err := os.MkdirAll(versionDir, 0o700); err != nil {
		t.Fatal(err)
	}
	packagePath := filepath.Join(versionDir, "OpenHost-0.6.0-windows-amd64-installer.exe")
	if err := os.WriteFile(packagePath, []byte("pacote"), 0o600); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(t.TempDir(), "OpenHost.exe")
	if err := os.WriteFile(target, []byte("anterior"), 0o700); err != nil {
		t.Fatal(err)
	}
	latest := "0.6.0"
	service.mu.Lock()
	service.install = updater.Install{Kind: updater.InstallNSIS, Target: target, Writable: true}
	service.info.Latest = &latest
	service.info.State = UpdateReady
	service.info.OneClick = true
	service.ready = &readyUpdate{version: latest, packagePath: packagePath}
	service.mu.Unlock()

	var opened string
	service.openFolder = func(path string) error { opened = path; return nil }
	if err := service.OpenDownloadFolder(); err != nil || opened != versionDir {
		t.Fatalf("pasta = %q, %v", opened, err)
	}
	var helper, manifest string
	service.launchHelper = func(gotHelper, gotManifest string) error {
		helper, manifest = gotHelper, gotManifest
		return nil
	}
	quit := false
	service.quit = func() { quit = true }
	if err := service.RestartNow(); err != nil {
		t.Fatal(err)
	}
	if helper == "" || manifest == "" || !quit {
		t.Fatalf("restart helper=%q manifest=%q quit=%v", helper, manifest, quit)
	}
	if _, err := updater.LoadApplyManifest(services.dataDir, manifest); err != nil {
		t.Fatalf("manifesto preparado = %v", err)
	}

	service.mu.Lock()
	service.info.State = UpdateReady
	service.mu.Unlock()
	helper, manifest = "", ""
	if err := service.ApplyOnQuit(); err != nil {
		t.Fatal(err)
	}
	if helper != "" || manifest != "" {
		t.Fatal("ApplyOnQuit iniciou o helper antes do shutdown")
	}
	service.launchPendingOnShutdown()
	if helper == "" || manifest == "" {
		t.Fatal("helper pendente não iniciou no shutdown")
	}

	oldDir := filepath.Join(services.dataDir, "updates", "0.5.0")
	if err := os.MkdirAll(oldDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := updater.WriteLastResult(services.dataDir, updater.LastUpdateResult{Version: "0.6.0", Status: "ok", At: "2026-10-27T12:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	result, err := service.LastResult()
	if err != nil || result == nil || result.Status != "ok" || result.Version != "0.6.0" {
		t.Fatalf("resultado = %+v, %v", result, err)
	}
	if _, err := os.Stat(oldDir); !os.IsNotExist(err) {
		t.Fatalf("versão antiga sobreviveu: %v", err)
	}
	if result, err := service.LastResult(); err != nil || result != nil {
		t.Fatalf("resultado repetido = %+v, %v", result, err)
	}
}

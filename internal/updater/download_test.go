package updater

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDownloadResumesAndLimitsProgress(t *testing.T) {
	t.Parallel()
	payload := []byte(strings.Repeat("openhost-update-", 64))
	var gotRange string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotRange = r.Header.Get("Range")
		if gotRange != "bytes=37-" {
			t.Errorf("Range = %q", gotRange)
		}
		w.Header().Set("Content-Range", fmt.Sprintf("bytes 37-%d/%d", len(payload)-1, len(payload)))
		w.WriteHeader(http.StatusPartialContent)
		_, _ = w.Write(payload[37:])
	}))
	defer server.Close()

	dir := t.TempDir()
	name := "OpenHost-0.6.0-windows-amd64-installer.exe"
	partial := filepath.Join(dir, name+".part")
	if err := os.WriteFile(partial, payload[:37], 0o600); err != nil {
		t.Fatal(err)
	}

	var progress []Progress
	path, err := Download(context.Background(), Config{
		ReleasesURL:      server.URL,
		Client:           server.Client(),
		FreeSpace:        func(string) (uint64, error) { return uint64(len(payload) * 4), nil },
		ProgressInterval: time.Hour,
	}, Asset{Name: name, Size: int64(len(payload)), URL: server.URL + "/asset"}, dir, func(value Progress) {
		progress = append(progress, value)
	})
	if err != nil {
		t.Fatal(err)
	}
	if gotRange != "bytes=37-" {
		t.Fatalf("download não retomou: Range = %q", gotRange)
	}
	if path != filepath.Join(dir, name) {
		t.Fatalf("caminho = %q", path)
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != string(payload) {
		t.Fatalf("pacote = %d bytes, erro=%v", len(got), err)
	}
	if _, err := os.Stat(partial); !os.IsNotExist(err) {
		t.Fatalf("parcial sobreviveu: %v", err)
	}
	if len(progress) != 2 || progress[0] != (Progress{Received: 37, Total: int64(len(payload))}) || progress[1] != (Progress{Received: int64(len(payload)), Total: int64(len(payload))}) {
		t.Fatalf("progresso = %+v", progress)
	}
}

func TestDownloadCancellationRemovesPartial(t *testing.T) {
	t.Parallel()
	started := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher := w.(http.Flusher)
		w.Header().Set("Content-Length", "1048576")
		_, _ = w.Write([]byte("começou"))
		flusher.Flush()
		close(started)
		<-r.Context().Done()
	}))
	defer server.Close()

	ctx, cancel := context.WithCancel(context.Background())
	dir := t.TempDir()
	name := "OpenHost-0.6.0-windows-amd64-installer.exe"
	done := make(chan error, 1)
	go func() {
		_, err := Download(ctx, Config{
			ReleasesURL: server.URL,
			Client:      server.Client(),
			FreeSpace:   func(string) (uint64, error) { return 4 << 20, nil },
		}, Asset{Name: name, Size: 1 << 20, URL: server.URL + "/asset"}, dir, nil)
		done <- err
	}()
	<-started
	cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatalf("erro = %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, name+".part")); !os.IsNotExist(err) {
		t.Fatalf("parcial sobreviveu ao cancelamento: %v", err)
	}
}

func TestDownloadRejectsInsufficientSpaceSizeAndUnsafeInput(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("curto"))
	}))
	defer server.Close()
	dir := t.TempDir()
	asset := Asset{Name: "OpenHost-0.6.0-windows-amd64-installer.exe", Size: 10, URL: server.URL + "/asset"}
	_, err := Download(context.Background(), Config{
		ReleasesURL: server.URL,
		Client:      server.Client(),
		FreeSpace:   func(string) (uint64, error) { return 19, nil },
	}, asset, dir, nil)
	if !errors.Is(err, ErrDiskSpace) {
		t.Fatalf("espaço insuficiente = %v", err)
	}

	asset.Size = 8
	_, err = Download(context.Background(), Config{
		ReleasesURL: server.URL,
		Client:      server.Client(),
		FreeSpace:   func(string) (uint64, error) { return 100, nil },
	}, asset, dir, nil)
	if !errors.Is(err, ErrSize) {
		t.Fatalf("tamanho incorreto = %v", err)
	}

	asset.Name = "..\\payload.exe"
	if _, err := Download(context.Background(), Config{ReleasesURL: server.URL}, asset, dir, nil); !errors.Is(err, ErrUnsafeAsset) {
		t.Fatalf("nome inseguro = %v", err)
	}
	asset.Name = "OpenHost-0.6.0-windows-amd64-installer.exe"
	asset.URL = "https://evil.example/payload.exe"
	if _, err := Download(context.Background(), Config{ReleasesURL: server.URL}, asset, dir, nil); !errors.Is(err, ErrUnsafeAsset) {
		t.Fatalf("URL insegura = %v", err)
	}
	asset.Name = "payload.exe"
	asset.URL = server.URL + "/payload.exe"
	if _, err := Download(context.Background(), Config{ReleasesURL: server.URL}, asset, dir, nil); !errors.Is(err, ErrUnsafeAsset) {
		t.Fatalf("nome desconhecido = %v", err)
	}
}

func TestCleanupOldVersionsOnlyRemovesVersionDirectories(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, name := range []string{"0.5.0", "0.6.0", "not-a-version"} {
		if err := os.Mkdir(filepath.Join(root, name), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := CleanupOldVersions(root, "0.6.0"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, "0.5.0")); !os.IsNotExist(err) {
		t.Fatalf("versão antiga sobreviveu: %v", err)
	}
	for _, name := range []string{"0.6.0", "not-a-version"} {
		if _, err := os.Stat(filepath.Join(root, name)); err != nil {
			t.Fatalf("%s foi removido: %v", name, err)
		}
	}
}

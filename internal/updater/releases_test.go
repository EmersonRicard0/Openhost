package updater

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchReleasesHeadersETagAndRateLimit(t *testing.T) {
	var status = http.StatusOK
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.UserAgent() != "OpenHost/0.5.0" {
			t.Errorf("User-Agent = %q", r.UserAgent())
		}
		if r.Header.Get("If-None-Match") != `"old"` {
			t.Errorf("If-None-Match = %q", r.Header.Get("If-None-Match"))
		}
		w.Header().Set("ETag", `"new"`)
		w.WriteHeader(status)
		if status == http.StatusOK {
			_, _ = fmt.Fprint(w, `[{"tag_name":"v0.6.0","draft":false,"prerelease":false,"body":"Notas","published_at":"2026-10-26T12:00:00Z","assets":[]}]`)
		}
	}))
	defer server.Close()

	cfg := Config{ReleasesURL: server.URL, UserAgent: "OpenHost/0.5.0", Client: server.Client()}
	releases, etag, notModified, err := FetchReleases(context.Background(), cfg, `"old"`)
	if err != nil || notModified || etag != `"new"` || len(releases) != 1 || releases[0].Version != "0.6.0" {
		t.Fatalf("releases=%+v etag=%q notModified=%v err=%v", releases, etag, notModified, err)
	}

	status = http.StatusNotModified
	releases, etag, notModified, err = FetchReleases(context.Background(), cfg, `"old"`)
	if err != nil || !notModified || releases != nil || etag != `"new"` {
		t.Fatalf("304: releases=%v etag=%q notModified=%v err=%v", releases, etag, notModified, err)
	}

	for _, code := range []int{http.StatusForbidden, http.StatusTooManyRequests} {
		status = code
		_, _, _, err = FetchReleases(context.Background(), cfg, `"old"`)
		if !errors.Is(err, ErrRateLimited) {
			t.Fatalf("status %d: erro=%v, esperado RATE_LIMITED", code, err)
		}
	}
}

func TestPickHighestEligibleCompatibleRelease(t *testing.T) {
	asset := func(name string) Asset {
		return Asset{Name: name, Size: 123, URL: "https://github.com/EmersonRicard0/Openhost/releases/download/v0.6.0/" + name}
	}
	releases := []Release{
		{Version: "0.5.0", Assets: []Asset{asset("OpenHost-0.5.0-windows-amd64-installer.exe")}},
		{Version: "0.6.0-rc.2", Prerelease: true, Assets: []Asset{asset("OpenHost-0.6.0-rc.2-windows-amd64-installer.exe")}},
		{Version: "0.6.0", Draft: true, Assets: []Asset{asset("OpenHost-0.6.0-windows-amd64-installer.exe")}},
		{Version: "0.7.0", Assets: []Asset{asset("OpenHost-0.7.0-macos-universal.dmg")}},
		{Version: "0.6.1", Notes: "estável", Assets: []Asset{
			asset("OpenHost-0.6.1-windows-amd64-installer.exe"),
			asset("SHA256SUMS.txt"), asset("SHA256SUMS.txt.sig"),
		}},
	}

	choice := Pick(releases, "0.5.0", false, Install{Kind: InstallNSIS}, "windows", "amd64")
	if choice == nil || choice.Version != "0.6.1" || choice.Package.Name != "OpenHost-0.6.1-windows-amd64-installer.exe" || choice.Notes != "estável" {
		t.Fatalf("escolha estável = %+v", choice)
	}
	choice = Pick(releases, "0.5.0", true, Install{Kind: InstallNSIS}, "windows", "amd64")
	if choice == nil || choice.Version != "0.6.1" {
		t.Fatalf("escolha com prerelease = %+v", choice)
	}
	choice = Pick(releases, "0.6.1", true, Install{Kind: InstallNSIS}, "windows", "amd64")
	if choice != nil {
		t.Fatalf("ofereceu versão igual/menor: %+v", choice)
	}
}

func TestPickAssetNamesForEveryInstallFormat(t *testing.T) {
	tests := []struct {
		kind InstallKind
		os   string
		arch string
		name string
	}{
		{InstallNSIS, "windows", "amd64", "OpenHost-1.2.3-windows-amd64-installer.exe"},
		{InstallApp, "darwin", "arm64", "OpenHost-1.2.3-macos-universal.dmg"},
		{InstallAppImage, "linux", "amd64", "OpenHost-1.2.3-x86_64.AppImage"},
		{InstallAppImage, "linux", "arm64", "OpenHost-1.2.3-aarch64.AppImage"},
		{InstallDEB, "linux", "amd64", "openhost_1.2.3_amd64.deb"},
		{InstallRPM, "linux", "arm64", "openhost-1.2.3-1.aarch64.rpm"},
	}
	for _, test := range tests {
		t.Run(string(test.kind)+"-"+test.arch, func(t *testing.T) {
			releases := []Release{{Version: "1.2.3", Assets: []Asset{{Name: test.name, URL: "https://objects.githubusercontent.com/" + test.name}}}}
			choice := Pick(releases, "1.0.0", false, Install{Kind: test.kind}, test.os, test.arch)
			if choice == nil || choice.Package.Name != test.name {
				t.Fatalf("escolha = %+v", choice)
			}
		})
	}

	unsafe := []Release{{Version: "9.0.0", Assets: []Asset{{Name: "../../OpenHost-9.0.0-windows-amd64-installer.exe", URL: "https://evil.example/payload"}}}}
	if got := Pick(unsafe, "1.0.0", false, Install{Kind: InstallNSIS}, "windows", "amd64"); got != nil {
		t.Fatalf("asset desconhecido foi aceito: %+v", got)
	}
}

func TestParseSemverRejectsNumericPrereleaseWithLeadingZero(t *testing.T) {
	t.Parallel()
	for _, value := range []string{"1.2.3-01", "1.2.3-rc.01"} {
		if _, ok := parseSemver(value); ok {
			t.Errorf("SemVer inválida aceita: %q", value)
		}
	}
	for _, value := range []string{"1.2.3-0", "1.2.3-rc.1", "1.2.3-alpha-beta"} {
		if _, ok := parseSemver(value); !ok {
			t.Errorf("SemVer válida recusada: %q", value)
		}
	}
}

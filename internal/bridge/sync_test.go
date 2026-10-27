package bridge

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/cloudsync"
	"shellvault/internal/cloudsync/drivefake"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

type fakeSyncOAuth struct {
	session   cloudsync.OAuthSession
	client    *http.Client
	cancelled bool
}

func (f *fakeSyncOAuth) Connect(context.Context) (cloudsync.OAuthSession, error) {
	return f.session, nil
}
func (f *fakeSyncOAuth) Cancel()                                            { f.cancelled = true }
func (f *fakeSyncOAuth) Client(context.Context, *oauth2.Token) *http.Client { return f.client }

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) { return f(request) }

func TestSyncServiceContractAndSafeEvent(t *testing.T) {
	store, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Create("senha-segura-123", "senha-segura-123"); err != nil {
		t.Fatal(err)
	}
	fake := drivefake.New()
	defer fake.Close()
	base, _ := url.Parse(fake.URL())
	transport := fake.Client().Transport
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		copy := request.Clone(request.Context())
		copy.URL.Scheme, copy.URL.Host = base.Scheme, base.Host
		return transport.RoundTrip(copy)
	})}
	auth := &fakeSyncOAuth{client: client, session: cloudsync.OAuthSession{Email: "usuario@example.com",
		Token: &oauth2.Token{AccessToken: "access", RefreshToken: "refresh-super-secreto", Expiry: time.Now().Add(time.Hour)}}}
	var events []cloudsync.SyncInfo
	syncer := cloudsync.NewSyncer(store, appwin.NewPreferenceStore(store), nil, func(info cloudsync.SyncInfo) { events = append(events, info) })
	defer syncer.Close()
	service := newSyncService(func() context.Context { return context.Background() }, nil, auth, syncer, cloudsync.NewDrive)
	connected, err := service.Connect()
	if err != nil || connected.Email != "usuario@example.com" || connected.CloudHasVault {
		t.Fatalf("Connect=%+v %v", connected, err)
	}
	raw, _ := json.Marshal(connected)
	if strings.Contains(string(raw), "refresh") || strings.Contains(string(raw), "access") {
		t.Fatalf("token vazou: %s", raw)
	}
	info, err := service.Start("upload", "")
	if err != nil || info.State != cloudsync.SyncStateSynced {
		t.Fatalf("Start=%+v %v", info, err)
	}
	if err := service.SetDeviceName("Notebook principal"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SyncNow(); err != nil {
		t.Fatal(err)
	}
	got, _ := service.Info()
	if got.DeviceName == nil || *got.DeviceName != "Notebook principal" {
		t.Fatalf("Info=%+v", got)
	}
	_ = service.CancelConnect()
	if !auth.cancelled || len(events) == 0 {
		t.Fatalf("cancel=%v events=%d", auth.cancelled, len(events))
	}
	payload, _ := json.Marshal(events[len(events)-1])
	for _, field := range []string{`"state"`, `"available"`, `"email"`, `"deviceName"`, `"lastSync"`, `"pending"`, `"conflicts"`, `"reason"`} {
		if !strings.Contains(string(payload), field) {
			t.Fatalf("evento sem %s: %s", field, payload)
		}
	}
}

func TestSyncServiceOpenFromCloudAndReplace(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	client := fakeDriveClient(t, fake)
	seedStore, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	if err := seedStore.Create("senha-da-nuvem-123", "senha-da-nuvem-123"); err != nil {
		t.Fatal(err)
	}
	if err := seedStore.Mutate(func(content *model.Content) error {
		now := time.Now().UTC().Format(time.RFC3339Nano)
		content.Hosts = append(content.Hosts, model.Host{ID: "10000000-0000-4000-8000-000000000001", Label: "Nuvem",
			Address: "cloud.example.test", Port: 22, Username: "admin", AuthMethod: model.AuthAsk, OSIcon: model.OSIconAuto,
			CreatedAt: now, UpdatedAt: now})
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	seedSyncer := cloudsync.NewSyncer(seedStore, appwin.NewPreferenceStore(seedStore), nil, nil)
	if err := seedSyncer.StartUpload(context.Background(), cloudsync.SyncAccount{Email: "usuario@example.com", RefreshToken: "seed-refresh"}, cloudsync.NewDrive(client)); err != nil {
		t.Fatal(err)
	}
	seedSyncer.Close()
	if err := seedStore.Close(); err != nil {
		t.Fatal(err)
	}

	newStore, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	defer newStore.Close()
	newSyncer := cloudsync.NewSyncer(newStore, appwin.NewPreferenceStore(newStore), nil, nil)
	defer newSyncer.Close()
	newAuth := &fakeSyncOAuth{client: client, session: cloudsync.OAuthSession{Email: "usuario@example.com",
		Token: &oauth2.Token{AccessToken: "access", RefreshToken: "refresh", Expiry: time.Now().Add(time.Hour)}}}
	newService := newSyncService(func() context.Context { return context.Background() }, nil, newAuth, newSyncer, cloudsync.NewDrive)
	connected, err := newService.Connect()
	if err != nil || !connected.CloudHasVault {
		t.Fatalf("Connect novo=%+v %v", connected, err)
	}
	if err := newService.OpenFromCloud("senha-errada"); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("OpenFromCloud senha errada=%v", err)
	}
	if newStore.Status().State != vault.StateNonexistent {
		t.Fatalf("senha errada alterou cofre: %+v", newStore.Status())
	}
	if err := newService.OpenFromCloud("senha-da-nuvem-123"); err != nil {
		t.Fatal(err)
	}
	opened, err := newStore.Read()
	if err != nil || len(opened.Hosts) != 1 || opened.Hosts[0].Address != "cloud.example.test" {
		t.Fatalf("cofre aberto=%+v %v", opened, err)
	}

	replaceStore, err := vault.Open(t.TempDir(), vault.TestKDF)
	if err != nil {
		t.Fatal(err)
	}
	defer replaceStore.Close()
	if err := replaceStore.Create("senha-local-456", "senha-local-456"); err != nil {
		t.Fatal(err)
	}
	replaceSyncer := cloudsync.NewSyncer(replaceStore, appwin.NewPreferenceStore(replaceStore), nil, nil)
	defer replaceSyncer.Close()
	replaceAuth := &fakeSyncOAuth{client: client, session: newAuth.session}
	replaceService := newSyncService(func() context.Context { return context.Background() }, nil, replaceAuth, replaceSyncer, cloudsync.NewDrive)
	if connected, err := replaceService.Connect(); err != nil || !connected.CloudHasVault {
		t.Fatalf("Connect replace=%+v %v", connected, err)
	}
	info, err := replaceService.Start("replace", "senha-da-nuvem-123")
	if err != nil || info.State != cloudsync.SyncStateSynced {
		t.Fatalf("Start replace=%+v %v", info, err)
	}
	replaced, err := replaceStore.Read()
	if err != nil || len(replaced.Hosts) != 1 || replaced.Hosts[0].Address != "cloud.example.test" {
		t.Fatalf("cofre substituído=%+v %v", replaced, err)
	}
}

func fakeDriveClient(t *testing.T, fake *drivefake.Server) *http.Client {
	t.Helper()
	base, err := url.Parse(fake.URL())
	if err != nil {
		t.Fatal(err)
	}
	transport := fake.Client().Transport
	return &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		copy := request.Clone(request.Context())
		copy.URL.Scheme, copy.URL.Host = base.Scheme, base.Host
		return transport.RoundTrip(copy)
	})}
}

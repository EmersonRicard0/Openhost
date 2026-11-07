package cloudsync

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func TestVersionsAndRestoreOnlyFromLastListing(t *testing.T) {
	pair := newSyncPair(t)
	mutateHostLabel(t, pair.aStore, pair.firstHost, "Versão dois")
	mustSync(t, pair.a)
	mutateHostLabel(t, pair.aStore, pair.firstHost, "Versão três")
	mustSync(t, pair.a)
	versions, err := pair.a.Versions(context.Background())
	if err != nil || len(versions) != 3 {
		t.Fatalf("Versions=%+v %v", versions, err)
	}
	for index, version := range versions {
		if version.Name == "" || version.CreatedAt == "" || version.DeviceName != "Computador A" || version.Items < 2 {
			t.Fatalf("versão incompleta: %+v", version)
		}
		if index > 0 && versions[index-1].Name < version.Name {
			t.Fatalf("versões fora de ordem: %+v", versions)
		}
	}
	oldest := versions[len(versions)-1]
	before, _ := pair.drive.List(context.Background(), SnapshotFiles, 100)
	if err := pair.a.RestoreVersion(context.Background(), oldest.Name); err != nil {
		t.Fatal(err)
	}
	assertHostLabel(t, pair.aStore, pair.firstHost, "Primeiro")
	after, _ := pair.drive.List(context.Background(), SnapshotFiles, 100)
	if len(after) != len(before)+1 {
		t.Fatalf("restauração não virou snapshot: %d -> %d", len(before), len(after))
	}
	if err := pair.a.RestoreVersion(context.Background(), "../../vault.db"); apperr.CodeOf(err) != apperr.NotFound {
		t.Fatalf("nome livre aceito: %v", err)
	}
	if err := pair.a.RestoreVersion(context.Background(), after[0].Name); apperr.CodeOf(err) != apperr.NotFound {
		t.Fatalf("snapshot fora da última listagem aceito: %v", err)
	}
}

func TestVersionsOpenOlderEpochsAndKeysLeaveMemoryWhileLocked(t *testing.T) {
	pair := newSyncPair(t)
	if err := pair.a.ChangePassword(context.Background(), syncTestPassword, rotatedSyncPassword, rotatedSyncPassword); err != nil {
		t.Fatal(err)
	}
	versions, err := pair.a.Versions(context.Background())
	if err != nil || len(versions) != 2 {
		t.Fatalf("histórico entre épocas=%+v %v", versions, err)
	}
	pair.aStore.Lock()
	waitSync(t, pair.a, SyncStateLocked)
	pair.a.mu.Lock()
	keysWhileLocked := len(pair.a.state.EpochKeys)
	pair.a.mu.Unlock()
	if keysWhileLocked != 0 {
		t.Fatalf("DEKs históricas ficaram em memória bloqueada: %d", keysWhileLocked)
	}
	if err := pair.aStore.Unlock(rotatedSyncPassword); err != nil {
		t.Fatal(err)
	}
	waitSync(t, pair.a, SyncStateSynced)
	versions, err = pair.a.Versions(context.Background())
	if err != nil || len(versions) != 2 {
		t.Fatalf("histórico após desbloquear=%+v %v", versions, err)
	}
}

func TestRetentionKeepsThirtyNewestAndEverySnapshotFromThirtyDays(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	files := make([]DriveFile, 0, 36)
	for index := 0; index < 35; index++ {
		files = append(files, DriveFile{ID: "old-" + strings.Repeat("x", index%3+1),
			Name:        "snap-" + formatLamport(uint64(100-index)) + "-1111111111111111.ohs",
			CreatedTime: now.Add(-60 * 24 * time.Hour).Format(time.RFC3339Nano)})
	}
	files = append(files, DriveFile{ID: "recent", Name: "snap-000000000001-1111111111111111.ohs",
		CreatedTime: now.Add(-10 * 24 * time.Hour).Format(time.RFC3339Nano)})
	deletions, err := retentionDeletions(files, now)
	if err != nil || len(deletions) != 5 {
		t.Fatalf("retenção=%+v %v", deletions, err)
	}
	for _, file := range deletions {
		if file.ID == "recent" {
			t.Fatal("snapshot recente foi removido")
		}
	}
}

func TestDisconnectKeepsLocalStopsRequestsAndCanDeleteCloud(t *testing.T) {
	pair := newSyncPair(t)
	revoked := ""
	revoke := func(ctx context.Context, token string) error {
		values := url.Values{"token": {token}}
		request, _ := http.NewRequestWithContext(ctx, http.MethodPost, pair.fake.URL()+"/revoke", strings.NewReader(values.Encode()))
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		response, err := pair.fake.Client().Do(request)
		if err == nil {
			_ = response.Body.Close()
		}
		revoked = token
		return err
	}
	if err := pair.a.Disconnect(context.Background(), false, revoke); err != nil {
		t.Fatal(err)
	}
	if revoked != "refresh-a" || pair.a.Info().State != SyncStateOff {
		t.Fatalf("disconnect revoke=%q info=%+v", revoked, pair.a.Info())
	}
	content, err := pair.aStore.Read()
	if err != nil || len(content.Hosts) != 2 {
		t.Fatalf("conteúdo local perdido: %+v %v", content, err)
	}
	state, err := pair.aStore.SyncState()
	if err != nil || state != nil {
		t.Fatalf("sync_state após disconnect=%q %v", state, err)
	}
	requestCount := len(pair.fake.Requests())
	if err := pair.aStore.Mutate(func(content *model.Content) error {
		content.Hosts[0].Label = "Depois de desconectar"
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := pair.a.SyncNow(context.Background()); apperr.CodeOf(err) != apperr.NotFound {
		t.Fatalf("SyncNow desconectado=%v", err)
	}
	if got := len(pair.fake.Requests()); got != requestCount {
		t.Fatalf("houve requisição após revogação: %d -> %d", requestCount, got)
	}

	other := newSyncPair(t)
	if err := other.a.Disconnect(context.Background(), true, func(context.Context, string) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if files := other.fake.Files(); len(files) != 0 {
		t.Fatalf("arquivos não apagados: %+v", files)
	}
}

func TestSyncDetectsRemovedCloudAndRevokedToken(t *testing.T) {
	pair := newSyncPair(t)
	files, err := pair.drive.List(context.Background(), SnapshotFiles, 1000)
	if err != nil {
		t.Fatal(err)
	}
	keyrings, err := pair.drive.List(context.Background(), KeyringFiles, 2)
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range append(files, keyrings...) {
		if err := pair.drive.Delete(context.Background(), file.ID); err != nil {
			t.Fatal(err)
		}
	}
	if err := pair.a.SyncNow(context.Background()); err != nil {
		t.Fatal(err)
	}
	info := pair.a.Info()
	if info.State != SyncStateError || info.Reason == nil || *info.Reason != SyncFailureRemoved {
		t.Fatalf("nuvem removida=%+v", info)
	}

	authPair := newSyncPair(t)
	authPair.fake.FailNext(http.StatusUnauthorized, "revoked")
	if err := authPair.a.SyncNow(context.Background()); apperr.CodeOf(err) != apperr.SyncAuth {
		t.Fatalf("token revogado=%v", err)
	}
	info = authPair.a.Info()
	if info.State != SyncStateError || info.Reason == nil || *info.Reason != SyncFailureAuth {
		t.Fatalf("estado auth=%+v", info)
	}
}

func formatLamport(value uint64) string { return fmt.Sprintf("%012d", value) }

package cloudsync

import (
	"context"
	"strings"
	"testing"
)

// Dois computadores enviando ao mesmo tempo geram snapshots com o mesmo Lamport. O snapshot de A
// é escondido enquanto B sincroniza, para B subir o seu no mesmo Lamport sem ter visto o de A;
// depois o de A volta. Nenhum dos dois pode ficar sem a mudança do outro, qualquer que seja a
// ordem dos IDs de dispositivo nos nomes.
func TestConcurrentSnapshotsWithSameLamportAreBothMerged(t *testing.T) {
	pair := newSyncPair(t)
	ctx := context.Background()
	// Para os loops: a sincronização automática depois de abrir o cofre da nuvem entraria no meio
	// do cenário. SyncNow continua funcionando sem o loop.
	pair.a.Close()
	pair.b.Close()
	mutateHostLabel(t, pair.aStore, pair.firstHost, "Alterado em A")
	mutateHostLabel(t, pair.bStore, pair.secondHost, "Alterado em B")
	mustSync(t, pair.a)

	files, err := pair.drive.List(ctx, SnapshotFiles, snapshotScanPage)
	if err != nil || len(files) == 0 || !strings.HasSuffix(files[0].Name, pair.a.state.DeviceID+".ohs") {
		t.Fatalf("snapshot de A não é o mais novo: %+v %v", files, err)
	}
	hidden := files[0]
	data, err := pair.drive.Get(ctx, hidden.ID)
	if err != nil {
		t.Fatal(err)
	}
	if err := pair.drive.Delete(ctx, hidden.ID); err != nil {
		t.Fatal(err)
	}
	mustSync(t, pair.b)
	aLamport, _ := snapshotLamport(hidden.Name)
	if pair.b.state.Lamport != aLamport {
		t.Fatalf("o cenário não empatou: B=%d A=%d", pair.b.state.Lamport, aLamport)
	}
	if _, err := pair.drive.Create(ctx, hidden.Name, data, hidden.AppProperties); err != nil {
		t.Fatal(err)
	}

	mustSync(t, pair.b)
	assertHostLabel(t, pair.bStore, pair.firstHost, "Alterado em A")
	assertHostLabel(t, pair.bStore, pair.secondHost, "Alterado em B")
	mustSync(t, pair.a)
	assertHostLabel(t, pair.aStore, pair.firstHost, "Alterado em A")
	assertHostLabel(t, pair.aStore, pair.secondHost, "Alterado em B")
	if views, err := pair.a.Conflicts(); err != nil || len(views) != 0 {
		t.Fatalf("conflito inesperado em A: %+v %v", views, err)
	}
	if views, err := pair.b.Conflicts(); err != nil || len(views) != 0 {
		t.Fatalf("conflito inesperado em B: %+v %v", views, err)
	}
}

func TestSnapshotsToMergeIncludesTiesAndNewer(t *testing.T) {
	files := []DriveFile{
		{ID: "4", Name: "snap-000000000004-bbbbbbbbbbbbbbbb.ohs"},
		{ID: "3b", Name: "snap-000000000003-bbbbbbbbbbbbbbbb.ohs"},
		{ID: "3a", Name: "snap-000000000003-aaaaaaaaaaaaaaaa.ohs"},
		{ID: "2", Name: "snap-000000000002-aaaaaaaaaaaaaaaa.ohs"},
	}
	names := func(list []DriveFile) string {
		out := []string{}
		for _, file := range list {
			out = append(out, file.ID)
		}
		return strings.Join(out, ",")
	}
	cases := map[string]string{
		"snap-000000000003-aaaaaaaaaaaaaaaa.ohs": "3b,4",
		"snap-000000000004-bbbbbbbbbbbbbbbb.ohs": "",
		"snap-000000000002-aaaaaaaaaaaaaaaa.ohs": "3a,3b,4",
		"":                                       "4",
	}
	for base, want := range cases {
		if got := names(snapshotsToMerge(files, base)); got != want {
			t.Errorf("base %q: %s, esperado %s", base, got, want)
		}
	}
}

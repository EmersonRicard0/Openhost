package cloudsync

import (
	"bytes"
	"context"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/cloudsync/drivefake"
)

func TestDriveCRUDUsesOnlyAppDataFolder(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	drive := newDrive(fake.URL(), fake.Client())
	ctx := context.Background()

	keyring, err := drive.Create(ctx, "keyring.json", []byte("chaveiro"), nil)
	if err != nil {
		t.Fatal(err)
	}
	snapshotName := "snap-000000000001-aabbccddeeff0011.ohs"
	snapshot, err := drive.Create(ctx, snapshotName, []byte("snapshot"), map[string]string{"lamport": "1", "deviceId": "aabbccddeeff0011"})
	if err != nil {
		t.Fatal(err)
	}
	files, err := drive.List(ctx, SnapshotFiles, 40)
	if err != nil || len(files) != 1 || files[0].Name != snapshotName {
		t.Fatalf("List snapshots = %+v, %v", files, err)
	}
	data, err := drive.Get(ctx, snapshot.ID)
	if err != nil || string(data) != "snapshot" {
		t.Fatalf("Get = %q, %v", data, err)
	}
	if err := drive.UpdateKeyring(ctx, keyring.ID, []byte("novo-chaveiro")); err != nil {
		t.Fatal(err)
	}
	data, err = drive.Get(ctx, keyring.ID)
	if err != nil || string(data) != "novo-chaveiro" {
		t.Fatalf("keyring atualizado = %q, %v", data, err)
	}
	if err := drive.Delete(ctx, snapshot.ID); err != nil {
		t.Fatal(err)
	}
	files, err = drive.List(ctx, SnapshotFiles, 40)
	if err != nil || len(files) != 0 {
		t.Fatalf("snapshot não foi apagado: %+v, %v", files, err)
	}
	for _, request := range fake.Requests() {
		if request.Operation == "list" && request.Spaces != "appDataFolder" {
			t.Fatalf("list saiu de appDataFolder: %+v", request)
		}
		if request.Operation == "create" && request.Parent != "appDataFolder" {
			t.Fatalf("create saiu de appDataFolder: %+v", request)
		}
	}
}

func TestDriveUsesResumableAboveFiveMiB(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	drive := newDrive(fake.URL(), fake.Client())
	data := bytes.Repeat([]byte{0x5a}, 5<<20+1)
	file, err := drive.Create(context.Background(), "snap-000000000002-aabbccddeeff0011.ohs", data, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := drive.Get(context.Background(), file.ID)
	if err != nil || !bytes.Equal(got, data) {
		t.Fatalf("resumable corrompido: %d bytes, %v", len(got), err)
	}
	if !fake.SawOperation("create-resumable") {
		t.Fatal("upload grande não usou resumable")
	}
}

func TestDriveMapsSafeErrors(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	drive := newDrive(fake.URL(), fake.Client())
	cases := []struct {
		status int
		reason string
		want   apperr.Code
	}{
		{401, "", apperr.SyncAuth},
		{403, "storageQuotaExceeded", apperr.SyncQuota},
	}
	for _, test := range cases {
		fake.FailNext(test.status, test.reason)
		_, err := drive.List(context.Background(), SnapshotFiles, 1)
		if apperr.CodeOf(err) != test.want {
			t.Fatalf("status %d/%s = %v", test.status, test.reason, err)
		}
	}
	fake.SetOffline(true)
	_, err := drive.List(context.Background(), SnapshotFiles, 1)
	if apperr.CodeOf(err) != apperr.Network {
		t.Fatalf("rede = %v", err)
	}
}

func TestDriveRejectsExternalIdentifiers(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	drive := newDrive(fake.URL(), fake.Client())
	if _, err := drive.Get(context.Background(), "../arquivo"); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("id externo = %v", err)
	}
	if _, err := drive.Create(context.Background(), "arquivo-do-usuario.txt", nil, nil); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("nome externo = %v", err)
	}
}

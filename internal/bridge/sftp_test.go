package bridge

import (
	"os"
	"path/filepath"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/sftpx"
)

func TestSftpServiceValidatesBoundaryAndIsBound(t *testing.T) {
	services := testServices(t)
	service := services.sftpService

	if service == nil {
		t.Fatal("SftpService não foi criado")
	}
	bound := false
	for _, candidate := range services.Bound() {
		if candidate == service {
			bound = true
		}
	}
	if !bound {
		t.Fatal("SftpService não foi ligado ao Wails")
	}

	_, err := service.Open("id-inválido")
	wantBridgeCode(t, err, apperr.InvalidInput)
	_, err = service.List("id-inválido", "/")
	wantBridgeCode(t, err, apperr.InvalidInput)
	wantBridgeCode(t, service.Mkdir("id-inválido", "/tmp"), apperr.InvalidInput)
	wantBridgeCode(t, service.Rename("id-inválido", "/a", "/b"), apperr.InvalidInput)
	wantBridgeCode(t, service.Remove("id-inválido", "/tmp", true), apperr.InvalidInput)
	_, err = service.Upload("id-inválido", "/tmp")
	wantBridgeCode(t, err, apperr.InvalidInput)
	_, err = service.Download("id-inválido", []string{"/tmp/a"})
	wantBridgeCode(t, err, apperr.InvalidInput)
	wantBridgeCode(t, service.ResolveConflict("id-inválido", sftpx.ConflictSkip), apperr.InvalidInput)
	wantBridgeCode(t, service.Cancel("id-inválido"), apperr.InvalidInput)
}

func TestSftpDialogPathsAndRemotePathValidation(t *testing.T) {
	a, b := filepath.Join(t.TempDir(), "a.txt"), filepath.Join(t.TempDir(), "b.txt")
	sep := string(os.PathListSeparator)
	if got := splitDialogPaths(a + sep + b + sep + sep); len(got) != 2 || got[0] != a || got[1] != b {
		t.Fatalf("caminhos = %v", got)
	}
	for _, invalid := range []string{"", "a\x00b", string([]byte{0xff})} {
		if apperr.CodeOf(validRemotePath(invalid)) != apperr.InvalidInput {
			t.Fatalf("caminho inválido aceito: %q", invalid)
		}
	}
	if err := validRemotePath("/home/usuário/arquivo.txt"); err != nil {
		t.Fatal(err)
	}
}

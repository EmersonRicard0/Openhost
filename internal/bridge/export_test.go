package bridge

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/importer"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

func seedExportContent(t *testing.T, services *Services) (string, string, string) {
	t.Helper()
	var rootID, childID, looseHostID string
	if err := services.store.Mutate(func(content *model.Content) error {
		root, err := domain.CreateGroup(content, "Raiz", nil)
		if err != nil {
			return err
		}
		child, err := domain.CreateGroup(content, "Filho", model.Ptr(root.ID))
		if err != nil {
			return err
		}
		key, err := domain.GenerateEd25519(content, "Chave", nil, domain.Now())
		if err != nil {
			return err
		}
		one, err := domain.CreateHost(content, domain.HostInput{Label: "Um", Address: "one.example", Port: 22, Username: "ops", AuthMethod: model.AuthKey, CredentialID: model.Ptr(key.ID), GroupID: model.Ptr(child.ID), OSIcon: model.OSIconAuto}, domain.Now())
		if err != nil {
			return err
		}
		two, err := domain.CreateHost(content, domain.HostInput{Label: "Dois", Address: "two.example", Port: 22, Username: "ops", AuthMethod: model.AuthAsk, OSIcon: model.OSIconAuto}, domain.Now())
		if err != nil {
			return err
		}
		rootID, childID, looseHostID = root.ID, child.ID, two.ID
		_ = one
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	return rootID, childID, looseHostID
}

func TestExportServiceCountScopes(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	rootID, _, looseHostID := seedExportContent(t, services)
	for _, tc := range []struct {
		scope               ExportScope
		hosts, groups, keys int
	}{
		{ExportScope{Kind: ExportScopeAll}, 2, 2, 1},
		{ExportScope{Kind: ExportScopeGroup, GroupID: rootID}, 1, 2, 1},
		{ExportScope{Kind: ExportScopeHosts, HostIDs: []string{looseHostID}}, 1, 0, 0},
	} {
		got, err := services.exportService.Count(tc.scope)
		if err != nil || got.Hosts != tc.hosts || got.Groups != tc.groups || got.Keys != tc.keys {
			t.Fatalf("Count(%+v) = %+v, %v", tc.scope, got, err)
		}
	}
}

func TestExportServiceValidatesPasswordsAndSavesOpenHost(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	seedExportContent(t, services)
	services.exportService.kdf = vault.TestKDF
	request := ExportRequest{Format: ExportFormatOpenHost, Scope: ExportScope{Kind: ExportScopeAll}, IncludeKeys: true, MasterPassword: "errada-123", FilePassword: "senha-arquivo"}
	if _, err := services.exportService.Export(request); apperr.CodeOf(err) != apperr.VaultBadPassword {
		t.Fatalf("senha mestra errada = %v", err)
	}
	request.MasterPassword = "senha-teste-1"
	request.FilePassword = "curta"
	if _, err := services.exportService.Export(request); apperr.CodeOf(err) != apperr.WeakPassword {
		t.Fatalf("senha de arquivo fraca = %v", err)
	}
	request.FilePassword = "senha-arquivo"
	destination := filepath.Join(t.TempDir(), "backup")
	services.exportService.saveFile = func(context.Context, ExportFormat) (string, error) { return destination, nil }
	result, err := services.exportService.Export(request)
	if err != nil || result == nil || result.Hosts != 2 || result.Keys != 1 || result.Path != destination+".openhost" {
		t.Fatalf("Export = %+v, %v", result, err)
	}
	if _, err := os.Stat(result.Path); err != nil {
		t.Fatal(err)
	}
	password := "senha-arquivo"
	if _, err := importer.LoadOpenHost(result.Path, &password, model.EmptyContent()); err != nil {
		t.Fatal(err)
	}
	picks := 0
	services.importService.pickFile = func(context.Context, importer.SourceKind) (string, error) {
		picks++
		return result.Path, nil
	}
	if _, err := services.importService.Preview(importer.SourceOpenHost, PreviewOptions{}); apperr.CodeOf(err) != apperr.FilePasswordRequired {
		t.Fatalf("primeira prévia = %v", err)
	}
	wrong := "senha-errada"
	if _, err := services.importService.Preview(importer.SourceOpenHost, PreviewOptions{FilePassword: &wrong}); apperr.CodeOf(err) != apperr.FilePasswordWrong {
		t.Fatalf("nova tentativa = %v", err)
	}
	view, err := services.importService.Preview(importer.SourceOpenHost, PreviewOptions{FilePassword: &password})
	if err != nil || view == nil || len(view.Rows) != 2 || picks != 1 {
		t.Fatalf("reuso do arquivo = %+v, picks=%d, err=%v", view, picks, err)
	}
}

func TestExportServiceSavesOpenSSHAndCSV(t *testing.T) {
	services := testServices(t)
	if err := services.vaultService.Create("senha-teste-1", "senha-teste-1"); err != nil {
		t.Fatal(err)
	}
	seedExportContent(t, services)
	dir := t.TempDir()
	userConfig := filepath.Join(dir, ".ssh", "config")
	if err := os.MkdirAll(filepath.Dir(userConfig), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(userConfig, []byte("Host meu\n  HostName meu.example\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	services.exportService.sshConfigPath = func() string { return userConfig }
	var destination string
	var formats []ExportFormat
	services.exportService.saveFile = func(_ context.Context, format ExportFormat) (string, error) {
		formats = append(formats, format)
		return destination, nil
	}
	all := ExportScope{Kind: ExportScopeAll}

	// Arquivo novo qualquer: grava os blocos; chaves não se aplicam a esse formato.
	destination = filepath.Join(dir, "hosts.config")
	if _, err := services.exportService.Export(ExportRequest{Format: ExportFormatOpenSSH, Scope: all, IncludeKeys: true}); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("chaves no OpenSSH = %v", err)
	}
	result, err := services.exportService.Export(ExportRequest{Format: ExportFormatOpenSSH, Scope: all, SSHConfigMode: "newFile"})
	if err != nil || result == nil || result.Path != destination || result.Hosts != 2 || result.Keys != 0 {
		t.Fatalf("OpenSSH = %+v, %v", result, err)
	}
	if raw, _ := os.ReadFile(destination); !strings.Contains(string(raw), "Host Um\n  HostName one.example\n") {
		t.Fatalf("conteúdo OpenSSH: %s", raw)
	}

	// O ~/.ssh/config do usuário: só acrescentar; "novo arquivo" nunca o sobrescreve.
	destination = userConfig
	if _, err := services.exportService.Export(ExportRequest{Format: ExportFormatOpenSSH, Scope: all}); apperr.CodeOf(err) != apperr.InvalidInput {
		t.Fatalf("sem sshConfigMode = %v", err)
	}
	if _, err := services.exportService.Export(ExportRequest{Format: ExportFormatOpenSSH, Scope: all, SSHConfigMode: "newFile"}); apperr.CodeOf(err) != apperr.AlreadyExists {
		t.Fatalf("newFile no config do usuário = %v", err)
	}
	if _, err := services.exportService.Export(ExportRequest{Format: ExportFormatOpenSSH, Scope: all, SSHConfigMode: "append"}); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(userConfig)
	if !strings.HasPrefix(string(raw), "Host meu\n") || !strings.Contains(string(raw), "# >>> OpenHost\n") {
		t.Fatalf("acrescentar ao config do usuário: %s", raw)
	}
	if backups, _ := filepath.Glob(userConfig + ".bak-*"); len(backups) != 1 {
		t.Fatalf("cópia de segurança: %v", backups)
	}

	// CSV ganha a extensão quando falta.
	destination = filepath.Join(dir, "planilha")
	result, err = services.exportService.Export(ExportRequest{Format: ExportFormatCSV, Scope: all})
	if err != nil || result == nil || result.Path != destination+".csv" {
		t.Fatalf("CSV = %+v, %v", result, err)
	}
	if raw, _ := os.ReadFile(result.Path); !strings.Contains(string(raw), "nome;endereco;porta;usuario;grupo;chave\r\n") {
		t.Fatalf("conteúdo CSV: %q", raw)
	}
	if formats[len(formats)-1] != ExportFormatCSV {
		t.Fatalf("diálogo de salvar recebeu o formato errado: %v", formats)
	}
}

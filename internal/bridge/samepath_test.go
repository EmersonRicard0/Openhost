package bridge

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSamePath(t *testing.T) {
	dir := t.TempDir()
	config := filepath.Join(dir, "config")
	if err := os.WriteFile(config, []byte("Host a\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	other := filepath.Join(dir, "outro")
	if err := os.WriteFile(other, []byte("Host b\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	upper := filepath.Join(dir, "Config")

	if !samePath(config, filepath.Join(dir, ".", "config")) {
		t.Error("o mesmo arquivo por outro caminho deveria ser igual")
	}
	if samePath(config, other) || samePath("", config) {
		t.Error("arquivos diferentes ou caminho vazio não podem ser iguais")
	}
	// `Config` com C maiúsculo: no Windows é o mesmo arquivo; no Linux é outro (inexistente).
	// No macOS depende do volume, então só confere que não quebra.
	got := samePath(config, upper)
	switch {
	case pathsIgnoreCase && !got:
		t.Error("no Windows, Config e config são o mesmo arquivo")
	case !pathsIgnoreCase && !caseInsensitiveFS(dir) && got:
		t.Error("no Linux, Config e config são arquivos diferentes")
	}
	// Sem nenhum dos dois em disco, compara o texto.
	missing := filepath.Join(dir, "nao-existe")
	if !samePath(missing, missing) {
		t.Error("o mesmo caminho inexistente deveria ser igual")
	}
	if samePath(missing, strings.ToUpper(missing)) != pathsIgnoreCase {
		t.Errorf("caminhos inexistentes com caixa diferente: esperado %v", pathsIgnoreCase)
	}
}

// caseInsensitiveFS diz se o volume de dir ignora a caixa (APFS padrão do macOS).
func caseInsensitiveFS(dir string) bool {
	probe := filepath.Join(dir, "sonda-caixa")
	if err := os.WriteFile(probe, nil, 0o600); err != nil {
		return false
	}
	defer os.Remove(probe)
	_, err := os.Stat(filepath.Join(dir, "SONDA-CAIXA"))
	return err == nil
}

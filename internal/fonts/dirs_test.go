package fonts

import (
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/image/font/gofont/gomono"
	"golang.org/x/image/font/gofont/goregular"
)

// Fontes em subpastas (como no Linux e no macOS) entram; as proporcionais não.
func TestScanFindsMonospaceInSubdirectories(t *testing.T) {
	dir := t.TempDir()
	nested := filepath.Join(dir, "truetype", "go")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nested, "GoMono.ttf"), gomono.TTF, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "GoRegular.ttf"), goregular.TTF, 0o644); err != nil {
		t.Fatal(err)
	}
	items, err := scan([]string{dir, filepath.Join(dir, "nao-existe")})
	if err != nil {
		t.Fatal(err)
	}
	found := map[string]Font{}
	for _, item := range items {
		found[item.Family] = item
	}
	if got, ok := found["Go Mono"]; !ok || got.Source != SourceSystem {
		t.Fatalf("Go Mono não encontrada na subpasta: %+v", items)
	}
	if _, ok := found["Go"]; ok {
		t.Fatal("Go Regular é proporcional e não deveria aparecer")
	}
}

func TestDefaultDirectoriesNotEmpty(t *testing.T) {
	if len(defaultDirectories()) == 0 {
		t.Fatal("nenhum diretório de fontes para este sistema")
	}
}

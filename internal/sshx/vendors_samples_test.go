package sshx

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"shellvault/internal/domain"
)

func readVendorSample(t *testing.T, path string) Signals {
	t.Helper()
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	var signals Signals
	var source string
	var body strings.Builder
	scanner := bufio.NewScanner(file)
	inBody := false
	for scanner.Scan() {
		line := scanner.Text()
		if !inBody && strings.HasPrefix(line, "# ") {
			switch {
			case strings.HasPrefix(line, "# fonte:"):
				source = strings.TrimSpace(strings.TrimPrefix(line, "# fonte:"))
			case strings.HasPrefix(line, "# versao:"):
				signals.Version = strings.TrimSpace(strings.TrimPrefix(line, "# versao:"))
			case strings.HasPrefix(line, "# os-release:"):
				signals.OSRelease = strings.TrimSpace(strings.TrimPrefix(line, "# os-release:"))
				signals.ProbeOSRelease = true
			}
			continue
		}
		inBody = true
		body.WriteString(line)
		body.WriteByte('\n')
	}
	if err := scanner.Err(); err != nil {
		t.Fatal(err)
	}
	switch source {
	case "banner":
		signals.Banner = body.String()
	case "terminal":
		signals.Terminal = []byte(body.String())
	default:
		t.Fatalf("fonte inválida em %s: %q", path, source)
	}
	return signals
}

func TestVendorSamples(t *testing.T) {
	root := filepath.Join("testdata", "vendors")
	counts := map[string]int{}
	hits := map[string]int{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil || entry.IsDir() || filepath.Ext(path) != ".txt" {
			return err
		}
		vendor := filepath.Base(filepath.Dir(path))
		counts[vendor]++
		if got := ResolveOS(readVendorSample(t, path)); got == vendor {
			hits[vendor]++
		} else {
			t.Errorf("%s classificado como %q, esperado %q", path, got, vendor)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	for vendor, count := range counts {
		if count < 3 {
			t.Errorf("%s tem somente %d amostras", vendor, count)
		}
		if hits[vendor]*10 < count*9 {
			t.Errorf("%s reconheceu %d/%d amostras, abaixo de 90%%", vendor, hits[vendor], count)
		}
	}
}

func TestServerSamplesAreNotNetwork(t *testing.T) {
	paths, err := filepath.Glob(filepath.Join("testdata", "servers", "*.txt"))
	if err != nil {
		t.Fatal(err)
	}
	if len(paths) == 0 {
		t.Fatal("nenhuma amostra de servidor")
	}
	for _, path := range paths {
		if got := ResolveOS(readVendorSample(t, path)); domain.IsNetworkOS(got) {
			t.Errorf("%s teve falso positivo de rede: %q", path, got)
		}
	}
}

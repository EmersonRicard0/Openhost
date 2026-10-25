package localpty

import (
	"encoding/binary"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"unicode/utf16"
)

func TestDetectShellsWithInjectedReaders(t *testing.T) {
	root := `C:\Windows`
	programFiles := `C:\Program Files`
	pwsh := filepath.Join(programFiles, `PowerShell\7\pwsh.exe`)
	git := filepath.Join(`D:\Apps\Git`, `bin\bash.exe`)
	wsl := filepath.Join(root, `System32\wsl.exe`)
	existing := map[string]bool{
		filepath.Join(root, `System32\WindowsPowerShell\v1.0\powershell.exe`): true,
		filepath.Join(root, `System32\cmd.exe`):                               true,
		pwsh:                                                                  true, git: true, wsl: true,
	}
	readers := shellReaders{
		getenv: func(key string) string {
			if key == "SystemRoot" {
				return root
			}
			if key == "ProgramFiles" {
				return programFiles
			}
			return ""
		},
		lookPath: func(string) (string, error) { return "", errors.New("ausente") },
		exists:   func(path string) bool { return existing[path] },
		glob: func(pattern string) ([]string, error) {
			return []string{pwsh}, nil
		},
		registryDirs: func() []string { return []string{`D:\Apps\Git`} },
		output: func(path string, args ...string) ([]byte, error) {
			if path != wsl || !reflect.DeepEqual(args, []string{"-l", "-q"}) {
				t.Fatalf("comando WSL = %q %v", path, args)
			}
			return utf16LE("Ubuntu\r\nDebian\r\n"), nil
		},
	}

	got := detectShells(readers)
	want := []struct {
		id, label string
		kind      ShellKind
		args      []string
	}{
		{"powershell", "Windows PowerShell", KindPowerShell, nil},
		{"pwsh", "PowerShell 7", KindPwsh, nil},
		{"cmd", "Prompt de Comando", KindCmd, nil},
		{"gitbash", "Git Bash", KindGitBash, []string{"--login", "-i"}},
		{"wsl:Debian", "Debian", KindWSL, []string{"-d", "Debian"}},
		{"wsl:Ubuntu", "Ubuntu", KindWSL, []string{"-d", "Ubuntu"}},
	}
	if len(got) != len(want) {
		t.Fatalf("shells = %+v", got)
	}
	for i := range want {
		if got[i].ID != want[i].id || got[i].Label != want[i].label || got[i].Kind != want[i].kind || !reflect.DeepEqual(got[i].args, want[i].args) {
			t.Errorf("shell %d = %+v, esperado %+v", i, got[i], want[i])
		}
	}
}

func TestDetectShellsUsesPATHAndOmitsMissing(t *testing.T) {
	pwsh := `D:\PowerShell\pwsh.exe`
	readers := shellReaders{
		getenv: func(string) string { return "" },
		lookPath: func(name string) (string, error) {
			if name == "pwsh.exe" {
				return pwsh, nil
			}
			return "", errors.New("ausente")
		},
		exists:       func(path string) bool { return path == pwsh },
		glob:         filepath.Glob,
		registryDirs: func() []string { return nil },
		output:       func(string, ...string) ([]byte, error) { return nil, errors.New("não executado") },
	}
	got := detectShells(readers)
	if len(got) != 1 || got[0].ID != "pwsh" {
		t.Fatalf("shells = %+v", got)
	}
}

func TestParseWSLDistrosUTF16AndValidIDs(t *testing.T) {
	got := parseWSLDistros(utf16LE("\ufeffUbuntu\r\nUbuntu\r\n openSUSE Tumbleweed \r\n"))
	if !reflect.DeepEqual(got, []string{"Ubuntu", "openSUSE Tumbleweed"}) {
		t.Fatalf("distros = %v", got)
	}
	for _, id := range []string{"powershell", "pwsh", "cmd", "gitbash", "wsl:Ubuntu", "wsl:openSUSE Tumbleweed"} {
		if !ValidShellID(id) {
			t.Errorf("id válido recusado: %q", id)
		}
	}
	for _, id := range []string{"", "bash", "wsl:", "wsl: Ubuntu", "wsl:Ubuntu\nDebian"} {
		if ValidShellID(id) {
			t.Errorf("id inválido aceito: %q", id)
		}
	}
}

func utf16LE(text string) []byte {
	words := utf16.Encode([]rune(text))
	output := make([]byte, len(words)*2)
	for i, word := range words {
		binary.LittleEndian.PutUint16(output[i*2:], word)
	}
	return output
}

//go:build !windows

package localpty

import (
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

type unixShellFixture struct {
	files       map[string]string
	executables map[string]bool
	realPaths   map[string]string
	pathEntries map[string]string
	environment map[string]string
}

func (f unixShellFixture) readers() shellReaders {
	return shellReaders{
		getenv: func(key string) string { return f.environment[key] },
		lookPath: func(name string) (string, error) {
			if path := f.pathEntries[name]; path != "" {
				return path, nil
			}
			return "", errors.New("ausente")
		},
		readFile: func(path string) ([]byte, error) {
			if contents, ok := f.files[path]; ok {
				return []byte(contents), nil
			}
			return nil, errors.New("ausente")
		},
		isExecutable: func(path string) bool { return f.executables[path] },
		evalSymlinks: func(path string) (string, error) {
			if real := f.realPaths[path]; real != "" {
				return real, nil
			}
			return path, nil
		},
	}
}

func TestDetectShellsUnixFiltersDeduplicatesAndSorts(t *testing.T) {
	fixture := unixShellFixture{
		files: map[string]string{
			"/etc/shells": "\n# shells permitidos\n/bin/zsh\n/bin/bash\n/usr/bin/bash\n/usr/local/bin/bash\n/bin/nao-executavel\n/diretorio/fish\n",
		},
		executables: map[string]bool{
			"/bin/zsh": true, "/bin/bash": true, "/usr/bin/bash": true, "/usr/local/bin/bash": true,
		},
		realPaths: map[string]string{
			"/bin/bash": "/usr/bin/bash", "/usr/bin/bash": "/usr/bin/bash",
		},
		environment: map[string]string{"SHELL": "/bin/zsh", "USER": "alice"},
	}

	got := detectShells(fixture.readers())
	want := []struct {
		id, label, path string
	}{
		{"zsh", "zsh", "/bin/zsh"},
		{"bash", "bash", "/usr/bin/bash"},
		{"bash-usr-local", "bash", "/usr/local/bin/bash"},
	}
	if len(got) != len(want) {
		t.Fatalf("shells = %+v", got)
	}
	for i := range want {
		if got[i].ID != want[i].id || got[i].Label != want[i].label || got[i].Kind != KindUnix || got[i].path != want[i].path || !reflect.DeepEqual(got[i].args, []string{"-l"}) {
			t.Errorf("shell %d = %+v, esperado %+v", i, got[i], want[i])
		}
	}
}

func TestDefaultShellUnixFallsBackToPasswdThenBinSh(t *testing.T) {
	for _, test := range []struct {
		name   string
		files  map[string]string
		execs  map[string]bool
		env    map[string]string
		wantID string
	}{
		{
			name: "passwd",
			files: map[string]string{
				"/etc/shells": "/bin/bash\n/bin/fish\n",
				"/etc/passwd": "root:x:0:0:root:/root:/bin/bash\nalice:x:1000:1000:Alice:/home/alice:/bin/fish\n",
			},
			execs:  map[string]bool{"/bin/bash": true, "/bin/fish": true},
			env:    map[string]string{"USER": "alice"},
			wantID: "fish",
		},
		{
			name: "bin sh",
			files: map[string]string{
				"/etc/shells": "/bin/bash\n",
			},
			execs:  map[string]bool{"/bin/bash": true, "/bin/sh": true},
			env:    map[string]string{"USER": "alice"},
			wantID: "sh",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			got := detectShells(unixShellFixture{files: test.files, executables: test.execs, environment: test.env}.readers())
			if len(got) == 0 || got[0].ID != test.wantID {
				t.Fatalf("shell padrão = %+v, esperado %q", got, test.wantID)
			}
		})
	}
}

func TestDetectShellsUnixUsesPATHWithoutEtcShells(t *testing.T) {
	paths := map[string]string{
		"bash": "/opt/homebrew/bin/bash",
		"zsh":  "/bin/zsh",
		"sh":   "/bin/sh",
	}
	fixture := unixShellFixture{
		files:       map[string]string{},
		executables: map[string]bool{"/opt/homebrew/bin/bash": true, "/bin/zsh": true, "/bin/sh": true},
		pathEntries: paths,
		environment: map[string]string{"SHELL": "/bin/zsh"},
	}
	got := detectShells(fixture.readers())
	if ids := shellIDs(got); !reflect.DeepEqual(ids, []string{"zsh", "bash", "sh"}) {
		t.Fatalf("ids = %v", ids)
	}
}

func TestResolveUnixDoesNotOpenSavedWindowsShell(t *testing.T) {
	fixture := unixShellFixture{
		files:       map[string]string{"/etc/shells": "/bin/zsh\n"},
		executables: map[string]bool{"/bin/zsh": true},
		environment: map[string]string{"SHELL": "/bin/zsh"},
	}
	if _, err := resolveShellWithReaders(PowerShell, fixture.readers()); err == nil {
		t.Fatal("PowerShell salvo não deve abrir como se fosse o shell Unix padrão")
	}
}

func TestValidShellIDUnix(t *testing.T) {
	for _, id := range []string{"bash", "zsh", "fish", "bash-usr-local", "nu_0.95", "powershell", "wsl:Ubuntu"} {
		if !ValidShellID(id) {
			t.Errorf("id válido recusado: %q", id)
		}
	}
	for _, id := range []string{"", "wsl:", "wsl: Ubuntu", " bash", "bash/evil", strings.Repeat("a", 129)} {
		if ValidShellID(id) {
			t.Errorf("id inválido aceito: %q", id)
		}
	}
}

func TestPTYEnvironmentUnixSetsTerm(t *testing.T) {
	got := ptyEnvironment([]string{"HOME=/home/alice", "TERM=dumb"})
	if !reflect.DeepEqual(got, []string{"HOME=/home/alice", "TERM=xterm-256color"}) {
		t.Fatalf("ambiente = %v", got)
	}
}

func shellIDs(shells []LocalShell) []string {
	ids := make([]string, len(shells))
	for i, shell := range shells {
		ids[i] = shell.ID
	}
	return ids
}

func TestUnixCollisionSuffix(t *testing.T) {
	if got := unixShellID("bash", filepath.FromSlash("/usr/local/bin/bash")); got != "bash-usr-local" {
		t.Fatalf("id = %q", got)
	}
}

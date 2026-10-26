package localpty

import "path/filepath"

type Shell string

const (
	PowerShell Shell = "powershell"
	Pwsh       Shell = "pwsh"
	Cmd        Shell = "cmd"
	GitBash    Shell = "gitbash"
)

type ShellKind string

const (
	KindPowerShell ShellKind = "powershell"
	KindPwsh       ShellKind = "pwsh"
	KindCmd        ShellKind = "cmd"
	KindGitBash    ShellKind = "gitbash"
	KindWSL        ShellKind = "wsl"
	KindUnix       ShellKind = "unix"
)

// LocalShell descreve um shell instalado sem expor o caminho do executável para a interface.
// path e args ficam no backend e são usados ao abrir a sessão.
type LocalShell struct {
	ID    string    `json:"id"`
	Label string    `json:"label"`
	Kind  ShellKind `json:"kind"`
	path  string
	args  []string
}

// shellReaders reúne as dependências de sistema usadas pela descoberta de shells. Cada
// implementação por plataforma preenche apenas o subconjunto de que precisa.
type shellReaders struct {
	getenv       func(string) string
	lookPath     func(string) (string, error)
	exists       func(string) bool
	glob         func(string) ([]string, error)
	registryDirs func() []string
	output       func(string, ...string) ([]byte, error)
	readFile     func(string) ([]byte, error)
	isExecutable func(string) bool
	evalSymlinks func(string) (string, error)
}

// ListShells devolve apenas shells presentes na máquina, em ordem estável.
func ListShells() []LocalShell {
	return detectShells(systemShellReaders())
}

func containsShell(shells []LocalShell, id string) bool {
	for _, shell := range shells {
		if shell.ID == id {
			return true
		}
	}
	return false
}

func absolutePath(path string) string {
	absolute, err := filepath.Abs(path)
	if err == nil {
		return absolute
	}
	return path
}

func resolveShell(id Shell) (LocalShell, error) {
	return resolveShellWithReaders(id, systemShellReaders())
}

// ShellPath devolve o caminho absoluto do executável detectado.
func ShellPath(shell Shell) (string, error) {
	resolved, err := resolveShell(shell)
	if err != nil {
		return "", err
	}
	return resolved.path, nil
}

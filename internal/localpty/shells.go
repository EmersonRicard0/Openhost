package localpty

import (
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"golang.org/x/sys/windows/registry"

	"shellvault/internal/apperr"
)

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

type shellReaders struct {
	getenv       func(string) string
	lookPath     func(string) (string, error)
	exists       func(string) bool
	glob         func(string) ([]string, error)
	registryDirs func() []string
	output       func(string, ...string) ([]byte, error)
}

func systemShellReaders() shellReaders {
	return shellReaders{
		getenv:   os.Getenv,
		lookPath: exec.LookPath,
		exists: func(path string) bool {
			info, err := os.Stat(path)
			return err == nil && !info.IsDir()
		},
		glob:         filepath.Glob,
		registryDirs: gitRegistryDirs,
		output: func(name string, args ...string) ([]byte, error) {
			return exec.Command(name, args...).Output()
		},
	}
}

// ListShells devolve apenas shells presentes na máquina, em ordem estável.
func ListShells() []LocalShell {
	return detectShells(systemShellReaders())
}

// ValidShellID valida ids persistidos, inclusive o id dinâmico de uma distribuição WSL.
func ValidShellID(id string) bool {
	switch Shell(id) {
	case PowerShell, Pwsh, Cmd, GitBash:
		return true
	}
	if !strings.HasPrefix(id, "wsl:") {
		return false
	}
	distro := strings.TrimPrefix(id, "wsl:")
	return distro != "" && distro == strings.TrimSpace(distro) && utf8.ValidString(distro) &&
		utf8.RuneCountInString(distro) <= 128 && !strings.ContainsAny(distro, "\x00\r\n")
}

func detectShells(r shellReaders) []LocalShell {
	root := r.getenv("SystemRoot")
	if root == "" || !filepath.IsAbs(root) {
		root = `C:\Windows`
	}
	programFiles := r.getenv("ProgramFiles")

	var shells []LocalShell
	add := func(id Shell, label string, kind ShellKind, path string, args ...string) {
		if path == "" || !r.exists(path) {
			return
		}
		for _, shell := range shells {
			if shell.ID == string(id) {
				return
			}
		}
		shells = append(shells, LocalShell{ID: string(id), Label: label, Kind: kind, path: path, args: args})
	}

	add(PowerShell, "Windows PowerShell", KindPowerShell,
		filepath.Join(root, `System32\WindowsPowerShell\v1.0\powershell.exe`))

	if path, err := r.lookPath("pwsh.exe"); err == nil {
		add(Pwsh, "PowerShell 7", KindPwsh, absolutePath(path))
	} else if programFiles != "" {
		matches, _ := r.glob(filepath.Join(programFiles, `PowerShell\*\pwsh.exe`))
		sort.Sort(sort.Reverse(sort.StringSlice(matches)))
		for _, match := range matches {
			if r.exists(match) {
				add(Pwsh, "PowerShell 7", KindPwsh, match)
				break
			}
		}
	}

	add(Cmd, "Prompt de Comando", KindCmd, filepath.Join(root, `System32\cmd.exe`))

	if programFiles != "" {
		add(GitBash, "Git Bash", KindGitBash, filepath.Join(programFiles, `Git\bin\bash.exe`), "--login", "-i")
	}
	if !containsShell(shells, string(GitBash)) {
		for _, dir := range r.registryDirs() {
			path := filepath.Join(dir, `bin\bash.exe`)
			if r.exists(path) {
				add(GitBash, "Git Bash", KindGitBash, path, "--login", "-i")
				break
			}
		}
	}

	wslPath := ""
	if path, err := r.lookPath("wsl.exe"); err == nil {
		wslPath = absolutePath(path)
	} else {
		candidate := filepath.Join(root, `System32\wsl.exe`)
		if r.exists(candidate) {
			wslPath = candidate
		}
	}
	if wslPath != "" {
		if output, err := r.output(wslPath, "-l", "-q"); err == nil {
			distros := parseWSLDistros(output)
			sort.Slice(distros, func(i, j int) bool { return strings.ToLower(distros[i]) < strings.ToLower(distros[j]) })
			for _, distro := range distros {
				shells = append(shells, LocalShell{
					ID: "wsl:" + distro, Label: distro, Kind: KindWSL,
					path: wslPath, args: []string{"-d", distro},
				})
			}
		}
	}
	return shells
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

func parseWSLDistros(output []byte) []string {
	text := decodeWindowsOutput(output)
	seen := make(map[string]bool)
	var distros []string
	for _, line := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		distro := strings.TrimSpace(strings.TrimPrefix(line, "\ufeff"))
		if distro == "" || seen[distro] {
			continue
		}
		seen[distro] = true
		distros = append(distros, distro)
	}
	return distros
}

func decodeWindowsOutput(output []byte) string {
	if len(output) < 2 {
		return string(output)
	}
	littleEndian := output[0] == 0xff && output[1] == 0xfe
	bigEndian := output[0] == 0xfe && output[1] == 0xff
	if !littleEndian && !bigEndian {
		for i := 1; i < len(output); i += 2 {
			if output[i] == 0 {
				littleEndian = true
				break
			}
		}
	}
	if !littleEndian && !bigEndian {
		return string(output)
	}
	if output[0] == 0xff || output[0] == 0xfe {
		output = output[2:]
	}
	words := make([]uint16, 0, len(output)/2)
	for i := 0; i+1 < len(output); i += 2 {
		if bigEndian {
			words = append(words, binary.BigEndian.Uint16(output[i:i+2]))
		} else {
			words = append(words, binary.LittleEndian.Uint16(output[i:i+2]))
		}
	}
	return string(utf16.Decode(words))
}

func gitRegistryDirs() []string {
	type location struct {
		root registry.Key
		path string
	}
	locations := []location{
		{registry.CURRENT_USER, `SOFTWARE\GitForWindows`},
		{registry.LOCAL_MACHINE, `SOFTWARE\GitForWindows`},
		{registry.LOCAL_MACHINE, `SOFTWARE\WOW6432Node\GitForWindows`},
	}
	var dirs []string
	for _, location := range locations {
		key, err := registry.OpenKey(location.root, location.path, registry.QUERY_VALUE)
		if err != nil {
			continue
		}
		value, _, err := key.GetStringValue("InstallPath")
		_ = key.Close()
		if err == nil && strings.TrimSpace(value) != "" {
			dirs = append(dirs, value)
		}
	}
	return dirs
}

func resolveShell(id Shell) (LocalShell, error) {
	for _, shell := range ListShells() {
		if shell.ID == string(id) {
			return shell, nil
		}
	}
	return LocalShell{}, apperr.New(apperr.InvalidInput)
}

// ShellPath devolve o caminho absoluto do executável detectado.
func ShellPath(shell Shell) (string, error) {
	resolved, err := resolveShell(shell)
	if err != nil {
		return "", err
	}
	return resolved.path, nil
}

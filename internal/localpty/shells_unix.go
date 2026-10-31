//go:build !windows

package localpty

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"shellvault/internal/apperr"
)

var unixPATHShells = []string{"bash", "zsh", "fish", "sh"}

func systemShellReaders() shellReaders {
	return shellReaders{
		getenv:   os.Getenv,
		lookPath: exec.LookPath,
		readFile: os.ReadFile,
		isExecutable: func(path string) bool {
			info, err := os.Stat(path)
			return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0
		},
		evalSymlinks: filepath.EvalSymlinks,
	}
}

func detectShells(r shellReaders) []LocalShell {
	candidates := unixShellCandidates(r)
	defaultPath := unixDefaultShellPath(r)
	if defaultPath != "" {
		candidates = append(candidates, defaultPath)
	}

	seenPaths := make(map[string]bool)
	var shells []LocalShell
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" || r.isExecutable == nil || !r.isExecutable(candidate) {
			continue
		}
		path := absolutePath(candidate)
		if r.evalSymlinks != nil {
			if realPath, err := r.evalSymlinks(path); err == nil {
				path = absolutePath(realPath)
			}
		}
		if seenPaths[path] {
			continue
		}
		seenPaths[path] = true
		shells = append(shells, LocalShell{
			Label: filepath.Base(path),
			Kind:  KindUnix,
			path:  path,
			args:  []string{"-l"},
		})
	}

	defaultPath = canonicalUnixPath(defaultPath, r)
	assignUnixShellIDs(shells)
	sort.SliceStable(shells, func(i, j int) bool {
		iDefault := shells[i].path == defaultPath
		jDefault := shells[j].path == defaultPath
		if iDefault != jDefault {
			return iDefault
		}
		iLabel, jLabel := strings.ToLower(shells[i].Label), strings.ToLower(shells[j].Label)
		if iLabel != jLabel {
			return iLabel < jLabel
		}
		return shells[i].ID < shells[j].ID
	})
	return shells
}

func unixShellCandidates(r shellReaders) []string {
	if r.readFile != nil {
		if contents, err := r.readFile("/etc/shells"); err == nil {
			var candidates []string
			for _, line := range strings.Split(string(contents), "\n") {
				if comment := strings.IndexByte(line, '#'); comment >= 0 {
					line = line[:comment]
				}
				if path := strings.TrimSpace(line); path != "" {
					candidates = append(candidates, path)
				}
			}
			return candidates
		}
	}

	var candidates []string
	for _, name := range unixPATHShells {
		if path, err := r.lookPath(name); err == nil {
			candidates = append(candidates, path)
		}
	}
	return candidates
}

func unixDefaultShellPath(r shellReaders) string {
	if path := strings.TrimSpace(r.getenv("SHELL")); path != "" && r.isExecutable(path) {
		return path
	}
	username := strings.TrimSpace(r.getenv("USER"))
	if username == "" {
		username = strings.TrimSpace(r.getenv("LOGNAME"))
	}
	if username != "" && r.readFile != nil {
		if contents, err := r.readFile("/etc/passwd"); err == nil {
			for _, line := range strings.Split(string(contents), "\n") {
				fields := strings.Split(line, ":")
				if len(fields) >= 7 && fields[0] == username {
					path := strings.TrimSpace(fields[len(fields)-1])
					if path != "" && r.isExecutable(path) {
						return path
					}
					break
				}
			}
		}
	}
	if r.isExecutable("/bin/sh") {
		return "/bin/sh"
	}
	return ""
}

func canonicalUnixPath(path string, r shellReaders) string {
	if path == "" {
		return ""
	}
	path = absolutePath(path)
	if r.evalSymlinks != nil {
		if realPath, err := r.evalSymlinks(path); err == nil {
			return absolutePath(realPath)
		}
	}
	return path
}

func assignUnixShellIDs(shells []LocalShell) {
	used := make(map[string]bool, len(shells))
	for i := range shells {
		id := shells[i].Label
		if used[id] {
			baseID := unixShellID(shells[i].Label, shells[i].path)
			id = baseID
			for suffix := 2; used[id]; suffix++ {
				id = baseID + "-" + strconv.Itoa(suffix)
			}
		}
		shells[i].ID = id
		used[id] = true
	}
}

func unixShellID(name, path string) string {
	directory := filepath.Dir(path)
	base := filepath.Base(directory)
	if base == "bin" || base == "sbin" {
		directory = filepath.Dir(directory)
	}
	suffix := strings.Trim(filepath.ToSlash(directory), "/")
	var cleaned strings.Builder
	lastDash := false
	for _, char := range suffix {
		if unicode.IsLetter(char) || unicode.IsDigit(char) {
			cleaned.WriteRune(unicode.ToLower(char))
			lastDash = false
		} else if !lastDash && cleaned.Len() > 0 {
			cleaned.WriteByte('-')
			lastDash = true
		}
	}
	cleanSuffix := strings.Trim(cleaned.String(), "-")
	if cleanSuffix == "" {
		cleanSuffix = "local"
	}
	return name + "-" + cleanSuffix
}

func ValidShellID(id string) bool {
	if validLegacyWindowsShellID(id) {
		return true
	}
	if id == "" || len(id) > 128 || !utf8.ValidString(id) || id != strings.TrimSpace(id) {
		return false
	}
	for _, char := range id {
		if unicode.IsLetter(char) || unicode.IsDigit(char) || strings.ContainsRune("._+-", char) {
			continue
		}
		return false
	}
	return true
}

func validLegacyWindowsShellID(id string) bool {
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

func resolveShellWithReaders(id Shell, r shellReaders) (LocalShell, error) {
	shells := detectShells(r)
	for _, shell := range shells {
		if shell.ID == string(id) {
			return shell, nil
		}
	}
	return LocalShell{}, apperr.New(apperr.InvalidInput)
}

func defaultShellIDWithReaders(r shellReaders) string {
	shells := detectShells(r)
	if len(shells) > 0 {
		return shells[0].ID
	}
	return "sh"
}

// DefaultShellID devolve o id do shell de login da plataforma.
func DefaultShellID() string { return defaultShellIDWithReaders(systemShellReaders()) }

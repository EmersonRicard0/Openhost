package localpty

import (
	"os"
	"path/filepath"

	"shellvault/internal/apperr"
)

type Shell string

const (
	PowerShell Shell = "powershell"
	Cmd        Shell = "cmd"
)

var relative = map[Shell]string{
	PowerShell: `System32\WindowsPowerShell\v1.0\powershell.exe`,
	Cmd:        `System32\cmd.exe`,
}

// ShellPath devolve o caminho absoluto do shell em %SystemRoot%, nunca pelo PATH.
func ShellPath(s Shell) (string, error) {
	rel, ok := relative[s]
	if !ok {
		return "", apperr.New(apperr.InvalidInput)
	}
	root := os.Getenv("SystemRoot")
	if root == "" || !filepath.IsAbs(root) {
		root = `C:\Windows`
	}
	return filepath.Join(root, rel), nil
}

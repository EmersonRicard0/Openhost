//go:build windows

package sshx

import (
	"io"
	"net"
	"os"
)

// AgentOpener abre a conexão com um ssh-agent.
type AgentOpener func() (io.ReadWriteCloser, error)

// openSystemAgent usa SSH_AUTH_SOCK se existir; senão, o agent do OpenSSH para Windows.
func openSystemAgent() (io.ReadWriteCloser, error) {
	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		return net.Dial("unix", sock)
	}
	return os.OpenFile(`\\.\pipe\openssh-ssh-agent`, os.O_RDWR, 0)
}

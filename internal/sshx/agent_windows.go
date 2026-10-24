//go:build windows

package sshx

import (
	"flag"
	"io"
	"net"
	"os"
	"strings"

	"github.com/Microsoft/go-winio"
)

const windowsOpenSSHAgentPipe = `\\.\pipe\openssh-ssh-agent`

// AgentOpener abre a conexão com um ssh-agent.
type AgentOpener func() (io.ReadWriteCloser, error)

// openSystemAgent usa o override dos testes, SSH_AUTH_SOCK quando configurado e, por padrão,
// o named pipe do agente OpenSSH do Windows.
func openSystemAgent() (io.ReadWriteCloser, error) {
	if flag.Lookup("test.v") != nil {
		if pipe := os.Getenv("SHELLVAULT_AGENT_PIPE"); pipe != "" {
			return winio.DialPipe(pipe, nil)
		}
	}
	if sock := os.Getenv("SSH_AUTH_SOCK"); sock != "" {
		if strings.HasPrefix(sock, `\\.\pipe\`) {
			return winio.DialPipe(sock, nil)
		}
		return net.Dial("unix", sock)
	}
	return winio.DialPipe(windowsOpenSSHAgentPipe, nil)
}

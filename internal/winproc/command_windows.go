//go:build windows

// Package winproc centraliza a criação de processos filhos sem console visível no Windows.
package winproc

import (
	"os/exec"
	"syscall"
)

const createNoWindow = 0x08000000

// Command cria um comando que nunca abre uma janela de console própria.
func Command(name string, args ...string) *exec.Cmd {
	command := exec.Command(name, args...)
	command.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: createNoWindow,
	}
	return command
}

//go:build windows

package winproc

import "testing"

func TestCommandHidesConsoleWindow(t *testing.T) {
	command := Command("cmd.exe", "/c", "exit")

	if command.SysProcAttr == nil {
		t.Fatal("Command() SysProcAttr = nil; want Windows process attributes")
	}
	if !command.SysProcAttr.HideWindow {
		t.Error("Command() HideWindow = false; want true")
	}
	if command.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Errorf("Command() CreationFlags = %#x; want CREATE_NO_WINDOW", command.SysProcAttr.CreationFlags)
	}
}

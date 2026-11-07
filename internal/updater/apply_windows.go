//go:build windows

package updater

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

func applyPlatform(manifest ApplyManifest) error {
	if manifest.Install != InstallNSIS {
		return ErrUnsafeManifest
	}
	return runElevated(manifest.PackagePath, "/S")
}

// shellExecuteInfo espelha SHELLEXECUTEINFOW (shellapi.h); x/sys/windows não expõe ShellExecuteEx.
type shellExecuteInfo struct {
	cbSize         uint32
	fMask          uint32
	hwnd           uintptr
	lpVerb         *uint16
	lpFile         *uint16
	lpParameters   *uint16
	lpDirectory    *uint16
	nShow          int32
	hInstApp       uintptr
	lpIDList       uintptr
	lpClass        *uint16
	hkeyClass      uintptr
	dwHotKey       uint32
	hIconOrMonitor uintptr
	hProcess       windows.Handle
}

var procShellExecuteEx = windows.NewLazySystemDLL("shell32.dll").NewProc("ShellExecuteExW")

// runElevated roda o instalador NSIS pelo verbo "runas" e espera ele terminar. O instalador
// pede administrador (RequestExecutionLevel admin) e o helper roda como usuário comum: pelo
// CreateProcess o Windows recusa com ERROR_ELEVATION_REQUIRED sem mostrar nada, e o app ficava
// na versão antiga. Pelo ShellExecuteEx aparece o pedido do UAC.
func runElevated(file, parameters string) error {
	const (
		seeMaskNoCloseProcess = 0x00000040
		seeMaskNoAsync        = 0x00000100
		seeMaskFlagNoUI       = 0x00000400
		swShowNormal          = 1
	)
	verb, err := windows.UTF16PtrFromString("runas")
	if err != nil {
		return err
	}
	path, err := windows.UTF16PtrFromString(file)
	if err != nil {
		return err
	}
	args, err := windows.UTF16PtrFromString(parameters)
	if err != nil {
		return err
	}
	info := shellExecuteInfo{
		fMask:        seeMaskNoCloseProcess | seeMaskNoAsync | seeMaskFlagNoUI,
		lpVerb:       verb,
		lpFile:       path,
		lpParameters: args,
		nShow:        swShowNormal,
	}
	info.cbSize = uint32(unsafe.Sizeof(info))
	if ok, _, callErr := procShellExecuteEx.Call(uintptr(unsafe.Pointer(&info))); ok == 0 {
		if errors.Is(callErr, windows.ERROR_CANCELLED) {
			return fmt.Errorf("pedido de administrador recusado: %w", os.ErrPermission)
		}
		return callErr
	}
	if info.hProcess == 0 {
		return errors.New("installer process handle missing")
	}
	defer windows.CloseHandle(info.hProcess)
	if _, err := windows.WaitForSingleObject(info.hProcess, windows.INFINITE); err != nil {
		return err
	}
	var code uint32
	if err := windows.GetExitCodeProcess(info.hProcess, &code); err != nil {
		return err
	}
	if code != 0 {
		return fmt.Errorf("installer exited with code %d", code)
	}
	return nil
}

func waitForProcess(pid int) error {
	const synchronize = 0x00100000
	handle, err := syscall.OpenProcess(synchronize, false, uint32(pid))
	if err != nil {
		if errors.Is(err, syscall.Errno(87)) {
			return nil
		}
		return err
	}
	defer syscall.CloseHandle(handle)
	const (
		waitObject0 = 0x00000000
		waitTimeout = 0x00000102
	)
	result, err := syscall.WaitForSingleObject(handle, 60_000)
	if err != nil {
		return err
	}
	if result == waitTimeout {
		return errors.New("timed out waiting for app to exit")
	}
	if result != waitObject0 {
		return errors.New("unexpected process wait result")
	}
	return nil
}

// relaunchDetached reabre o app sem HideWindow: com STARTF_USESHOWWINDOW/SW_HIDE a primeira
// janela do Wails nascia escondida e o app reaberto ficava rodando sem janela.
func relaunchDetached(arguments []string) error {
	command := exec.Command(arguments[0], arguments[1:]...)
	command.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x00000008 | 0x00000200}
	return command.Start()
}

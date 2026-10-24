//go:build windows

package appwin

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const (
	spiGetHighContrast = 0x0042
	hcfHighContrastOn  = 0x00000001
)

var systemParametersInfo = windows.NewLazySystemDLL("user32.dll").NewProc("SystemParametersInfoW")

type highContrast struct {
	Size        uint32
	Flags       uint32
	ColorScheme *uint16
}

type RegistryAppearanceReader struct{}

func (RegistryAppearanceReader) ReadAppearance() (SystemAppearance, error) {
	key, err := registry.OpenKey(registry.CURRENT_USER,
		`Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`, registry.QUERY_VALUE)
	if err != nil {
		return SystemAppearance{}, err
	}
	defer key.Close()
	transparency, _, err := key.GetIntegerValue("EnableTransparency")
	if err != nil {
		return SystemAppearance{}, err
	}
	light, _, err := key.GetIntegerValue("AppsUseLightTheme")
	if err != nil {
		return SystemAppearance{}, err
	}
	hc := highContrast{Size: uint32(unsafe.Sizeof(highContrast{}))}
	ok, _, callErr := systemParametersInfo.Call(spiGetHighContrast, uintptr(hc.Size), uintptr(unsafe.Pointer(&hc)), 0)
	if ok == 0 {
		return SystemAppearance{}, callErr
	}
	dwm, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\DWM`, registry.QUERY_VALUE)
	if err != nil {
		return SystemAppearance{}, err
	}
	defer dwm.Close()
	accent, _, err := dwm.GetIntegerValue("AccentColor")
	if err != nil {
		return SystemAppearance{}, err
	}
	accentHex := accentColorHex(uint32(accent))
	return SystemAppearance{
		TransparencyEnabled: transparency != 0,
		AppsUseLightTheme:   light != 0,
		HighContrast:        hc.Flags&hcfHighContrastOn != 0,
		SystemAccent:        &accentHex,
	}, nil
}

func accentColorHex(abgr uint32) string {
	return fmt.Sprintf("#%02x%02x%02x", byte(abgr), byte(abgr>>8), byte(abgr>>16))
}

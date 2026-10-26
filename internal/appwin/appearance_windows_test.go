//go:build windows

package appwin

import "testing"

func TestAccentColorABGR(t *testing.T) {
	if got := accentColorHex(0xff563412); got != "#123456" {
		t.Fatalf("accentColorHex = %q", got)
	}
	if !ValidAccent("system") || !ValidAccent("brand-violet") || ValidAccent("") || ValidAccent("Brand Violet") {
		t.Fatal("accent id validation is inconsistent")
	}
}

func TestAppearanceWithoutAccentKeepsOtherSystemValues(t *testing.T) {
	got := appearanceFromValues(1, 1, 0, nil)
	if !got.TransparencyEnabled || !got.AppsUseLightTheme || got.HighContrast || got.SystemAccent != nil {
		t.Fatalf("aparência sem AccentColor: %+v", got)
	}
	accent := uint64(0xff563412)
	got = appearanceFromValues(1, 0, hcfHighContrastOn, &accent)
	if got.SystemAccent == nil || *got.SystemAccent != "#123456" || !got.HighContrast {
		t.Fatalf("aparência com AccentColor: %+v", got)
	}
}

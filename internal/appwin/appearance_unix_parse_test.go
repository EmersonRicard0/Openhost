package appwin

import (
	"strconv"
	"testing"
)

func u32(v uint32) *uint32 { return &v }

func TestPortalAppearance(t *testing.T) {
	cases := []struct {
		name string
		in   portalValues
		dark bool
		hc   bool
		hex  string
	}{
		{"sem portal", portalValues{}, false, false, ""},
		{"escuro", portalValues{ColorScheme: u32(1)}, true, false, ""},
		{"claro", portalValues{ColorScheme: u32(2)}, false, false, ""},
		{"sem preferência", portalValues{ColorScheme: u32(0)}, false, false, ""},
		{"valor estranho", portalValues{ColorScheme: u32(9)}, false, false, ""},
		{"alto contraste", portalValues{Contrast: u32(1)}, false, true, ""},
		{"destaque", portalValues{AccentColor: &[3]float64{0.2, 0.4, 0.6}}, false, false, "#336699"},
		{"destaque fora do domínio", portalValues{AccentColor: &[3]float64{1.2, 0, 0}}, false, false, ""},
		{"destaque negativo", portalValues{AccentColor: &[3]float64{-1, -1, -1}}, false, false, ""},
	}
	for _, c := range cases {
		got := portalAppearance(c.in)
		hex := ""
		if got.SystemAccent != nil {
			hex = *got.SystemAccent
		}
		if got.AppsUseLightTheme == c.dark || got.HighContrast != c.hc || hex != c.hex || got.TransparencyEnabled {
			t.Errorf("%s: %+v (destaque %q)", c.name, got, hex)
		}
	}
}

func fakeDefaults(values map[string]string) macDefaults {
	return func(domain, key string) (string, bool) {
		v, ok := values[domain+" "+key]
		return v, ok
	}
}

func TestMacAppearance(t *testing.T) {
	plain := macAppearance(fakeDefaults(nil))
	if !plain.AppsUseLightTheme || !plain.TransparencyEnabled || plain.HighContrast || plain.SystemAccent != nil {
		t.Fatalf("sem chaves = %+v", plain)
	}
	dark := macAppearance(fakeDefaults(map[string]string{"-g AppleInterfaceStyle": "Dark\n"}))
	if dark.AppsUseLightTheme {
		t.Fatal("Dark deveria virar tema escuro")
	}
	if odd := macAppearance(fakeDefaults(map[string]string{"-g AppleInterfaceStyle": "Light"})); !odd.AppsUseLightTheme {
		t.Fatal("valor desconhecido deveria ficar claro")
	}
	for index, hex := range macAccentColors {
		got := macAppearance(fakeDefaults(map[string]string{"-g AppleAccentColor": " " + strconv.Itoa(index) + "\n"}))
		if got.SystemAccent == nil || *got.SystemAccent != hex {
			t.Errorf("AppleAccentColor %d = %v, esperado %s", index, got.SystemAccent, hex)
		}
	}
	for _, bad := range []string{"7", "azul", "", "4; rm -rf"} {
		if got := macAppearance(fakeDefaults(map[string]string{"-g AppleAccentColor": bad})); got.SystemAccent != nil {
			t.Errorf("AppleAccentColor %q deveria ser ignorado", bad)
		}
	}
	access := macAppearance(fakeDefaults(map[string]string{
		"com.apple.universalaccess reduceTransparency": "1",
		"com.apple.universalaccess increaseContrast":   "1",
	}))
	if access.TransparencyEnabled || !access.HighContrast {
		t.Fatalf("acessibilidade = %+v", access)
	}
}

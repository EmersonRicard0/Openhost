package appwin

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Conversão dos valores lidos no Linux e no macOS (specs/004-linux-macos, R3). Fica sem tag de
// build para os testes rodarem em qualquer sistema; a leitura em si está em appearance_linux.go
// e appearance_darwin.go.

// portalValues são as chaves de org.freedesktop.appearance; nil = o portal não informou.
type portalValues struct {
	ColorScheme *uint32
	AccentColor *[3]float64
	Contrast    *uint32
}

// portalAppearance: color-scheme 1 = escuro, 2 = claro, 0 ou desconhecido = claro; accent-color
// em RGB de 0 a 1 (fora disso é ignorado); contrast 1 = alto contraste. O Linux não tem vidro.
func portalAppearance(v portalValues) SystemAppearance {
	appearance := SystemAppearance{AppsUseLightTheme: true}
	if v.ColorScheme != nil && *v.ColorScheme == 1 {
		appearance.AppsUseLightTheme = false
	}
	if v.Contrast != nil && *v.Contrast == 1 {
		appearance.HighContrast = true
	}
	if v.AccentColor != nil {
		appearance.SystemAccent = rgbHex(*v.AccentColor)
	}
	return appearance
}

func rgbHex(rgb [3]float64) *string {
	var out [3]uint8
	for i, c := range rgb {
		if math.IsNaN(c) || c < 0 || c > 1 {
			return nil
		}
		out[i] = uint8(math.Round(c * 255))
	}
	hex := fmt.Sprintf("#%02x%02x%02x", out[0], out[1], out[2])
	return &hex
}

// macAccentColors traduz AppleAccentColor (Ajustes do Sistema › Aparência › Cor de destaque)
// para as cores de sistema documentadas pela Apple nas Human Interface Guidelines (variante
// clara). Sem a chave, o macOS usa "multicolor": o app fica com a própria cor.
var macAccentColors = map[int]string{
	-1: "#8e8e93", // grafite
	0:  "#ff3b30", // vermelho
	1:  "#ff9500", // laranja
	2:  "#ffcc00", // amarelo
	3:  "#34c759", // verde
	4:  "#007aff", // azul
	5:  "#af52de", // roxo
	6:  "#ff2d55", // rosa
}

// macDefaults lê uma chave com `defaults read`; ok falso quando ela não existe ou deu erro.
type macDefaults func(domain, key string) (value string, ok bool)

// macAppearance monta a aparência a partir das chaves do macOS. Valores fora do formato esperado
// (só números inteiros, ou `Dark`) contam como ausentes.
func macAppearance(read macDefaults) SystemAppearance {
	appearance := SystemAppearance{AppsUseLightTheme: true, TransparencyEnabled: true}
	if style, ok := read("-g", "AppleInterfaceStyle"); ok && strings.TrimSpace(style) == "Dark" {
		appearance.AppsUseLightTheme = false
	}
	if index, ok := macInt(read("-g", "AppleAccentColor")); ok {
		if hex, known := macAccentColors[index]; known {
			appearance.SystemAccent = &hex
		}
	}
	if value, ok := macInt(read("com.apple.universalaccess", "reduceTransparency")); ok && value == 1 {
		appearance.TransparencyEnabled = false
	}
	if value, ok := macInt(read("com.apple.universalaccess", "increaseContrast")); ok && value == 1 {
		appearance.HighContrast = true
	}
	return appearance
}

func macInt(raw string, ok bool) (int, bool) {
	if !ok {
		return 0, false
	}
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	return value, err == nil
}

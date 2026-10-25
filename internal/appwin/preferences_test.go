package appwin

import (
	"strings"
	"testing"
)

func TestValidateShortcuts(t *testing.T) {
	t.Parallel()
	valid := []map[string]string{
		{},
		{"closeTab": "Ctrl+Shift+W", "palette": ""},
		{"newTab": "Ctrl+Alt+T", "nextTab": "Ctrl+Tab", "search": "F5"},
		{"zoomIn": "Alt+Equal", "zoomOut": "Ctrl+Minus", "zoomReset": "Ctrl+Digit0"},
	}
	for _, shortcuts := range valid {
		if err := ValidateShortcuts(shortcuts); err != nil {
			t.Errorf("atalhos válidos %v: %v", shortcuts, err)
		}
	}

	invalid := []struct {
		name      string
		shortcuts map[string]string
		want      string
	}{
		{"ação desconhecida", map[string]string{"deploy": "Ctrl+D"}, "desconhecida"},
		{"sem modificador", map[string]string{"newTab": "T"}, "Ctrl ou Alt"},
		{"ordem", map[string]string{"newTab": "Shift+Ctrl+T"}, "ordem"},
		{"prefixo Key", map[string]string{"newTab": "Ctrl+KeyT"}, "código"},
		{"duplicata", map[string]string{"newTab": "Ctrl+T", "closeTab": "Ctrl+T"}, "duplicada"},
	}
	for _, test := range invalid {
		t.Run(test.name, func(t *testing.T) {
			err := ValidateShortcuts(test.shortcuts)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("erro = %v, esperado motivo %q", err, test.want)
			}
		})
	}
}

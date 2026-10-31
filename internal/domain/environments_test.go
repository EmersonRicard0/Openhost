package domain

import (
	"errors"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func TestValidateEnvironments(t *testing.T) {
	got, err := ValidateEnvironments([]model.Environment{
		{ID: "prod", Name: "  Produção  ", Color: "red"},
		{ID: "lab", Name: "Laboratório", Color: "green"},
	})
	mustOK(t, err)
	if got[0].Name != "Produção" || got[1].Name != "Laboratório" {
		t.Fatalf("ambientes normalizados = %+v", got)
	}

	cases := map[string][]model.Environment{
		"mais de 12":       make([]model.Environment, 13),
		"nome vazio":       {{ID: "x", Name: "  ", Color: "red"}},
		"nome longo":       {{ID: "x", Name: strings.Repeat("á", 25), Color: "red"}},
		"nome repetido":    {{ID: "a", Name: "Produção", Color: "red"}, {ID: "b", Name: "produção", Color: "blue"}},
		"cor desconhecida": {{ID: "x", Name: "Produção", Color: "purple"}},
	}
	for name, environments := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := ValidateEnvironments(environments)
			var appErr *apperr.Error
			if !errors.As(err, &appErr) || appErr.Code != apperr.InvalidInput ||
				!strings.Contains(appErr.Detail, "environments") {
				t.Fatalf("erro = %#v", err)
			}
		})
	}
}

func TestEnvironmentColors(t *testing.T) {
	for _, color := range []model.EnvironmentColor{"red", "orange", "amber", "green", "teal", "blue", "slate", "pink"} {
		if !model.ValidEnvironmentColor(color) {
			t.Errorf("cor válida rejeitada: %s", color)
		}
	}
	if model.ValidEnvironmentColor("purple") {
		t.Fatal("cor desconhecida aceita")
	}
}

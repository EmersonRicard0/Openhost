package domain

import (
	"strings"

	"shellvault/internal/model"
	"shellvault/internal/validate"
)

// ValidateEnvironments normaliza nomes e valida a lista inteira antes de persistir.
func ValidateEnvironments(environments []model.Environment) ([]model.Environment, error) {
	if len(environments) > 12 {
		return nil, invalidField("environments")
	}
	out := append([]model.Environment{}, environments...)
	seenNames := make(map[string]struct{}, len(out))
	seenIDs := make(map[string]struct{}, len(out))
	for i := range out {
		name, err := validate.Text(out[i].Name, 1, 24)
		if err != nil || !model.ValidEnvironmentColor(out[i].Color) {
			return nil, invalidField("environments")
		}
		key := strings.ToLower(name)
		if _, exists := seenNames[key]; exists {
			return nil, invalidField("environments")
		}
		seenNames[key] = struct{}{}
		if out[i].ID != "" {
			if _, exists := seenIDs[out[i].ID]; exists {
				return nil, invalidField("environments")
			}
			seenIDs[out[i].ID] = struct{}{}
		}
		out[i].Name = name
	}
	return out, nil
}

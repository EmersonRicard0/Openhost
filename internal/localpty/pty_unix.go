//go:build !windows

package localpty

import "strings"

func ptyEnvironment(environment []string) []string {
	result := make([]string, 0, len(environment)+1)
	for _, variable := range environment {
		if !strings.HasPrefix(variable, "TERM=") {
			result = append(result, variable)
		}
	}
	return append(result, "TERM=xterm-256color")
}

//go:build windows

package localpty

func ptyEnvironment(environment []string) []string { return environment }

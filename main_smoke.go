//go:build smoke

package main

import (
	"shellvault/internal/bridge"
	"shellvault/internal/bridge/smokesvc"
)

// Build do teste de abertura (scripts/smoke.mjs): liga só o Smoke.Ready.
func init() {
	extraBindings = func(s *bridge.Services) []any {
		return []any{smokesvc.New(s.Context)}
	}
}

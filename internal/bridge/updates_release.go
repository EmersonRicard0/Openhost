//go:build !e2e

package bridge

// configureForTest só existe de verdade no build e2e (updates_e2e.go).
func (s *UpdateService) configureForTest() {}

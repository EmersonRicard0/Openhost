package vault

import (
	"database/sql"
	"encoding/json"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

// ApplySynchronized grava, na mesma transação, todo o estado já validado recebido da nuvem.
// Não dispara OnChange: uma alteração remota não pode criar um ciclo de upload.
func (s *Store) ApplySynchronized(content *model.Content, profiles []model.TerminalProfile, schemes []model.ColorScheme, preferenceKey string, preference any) error {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked {
		return apperr.New(apperr.VaultLocked)
	}
	if content == nil || preferenceKey == "" {
		return apperr.New(apperr.InvalidInput)
	}
	raw, err := json.Marshal(preference)
	if err != nil {
		return err
	}
	draft := content.Clone()
	pre := func(tx *sql.Tx) error {
		if _, err := tx.Exec(`DELETE FROM terminal_profiles`); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM color_schemes`); err != nil {
			return err
		}
		for _, scheme := range schemes {
			if err := putColorScheme(tx, scheme); err != nil {
				return err
			}
		}
		for _, profile := range profiles {
			if err := putTerminalProfile(tx, profile); err != nil {
				return err
			}
		}
		_, err := tx.Exec(`INSERT INTO preferences (key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`, preferenceKey, string(raw))
		return err
	}
	sigs, err := s.persist(pre, s.dek, s.sigs, draft)
	if err != nil {
		return err
	}
	s.content, s.sigs = draft, sigs
	return nil
}

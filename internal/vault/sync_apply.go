package vault

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

// CreateSynchronized cria um cofre novo já com a DEK, o conteúdo e o estado vindos da nuvem.
// Tudo entra numa única transação; em falha, o cofre continua inexistente.
func (s *Store) CreateSynchronized(password string, newDEK []byte, content *model.Content, profiles []model.TerminalProfile, schemes []model.ColorScheme, preferenceKey string, preference any, syncState []byte) error {
	return s.installSynchronized(StateNonexistent, password, newDEK, content, profiles, schemes, preferenceKey, preference, syncState)
}

// ReplaceSynchronized troca um cofre desbloqueado pelo estado validado da nuvem, inclusive a
// senha/DEK, numa única transação. O chamador cria o backup antes desta operação.
func (s *Store) ReplaceSynchronized(password string, newDEK []byte, content *model.Content, profiles []model.TerminalProfile, schemes []model.ColorScheme, preferenceKey string, preference any, syncState []byte) error {
	return s.installSynchronized(StateUnlocked, password, newDEK, content, profiles, schemes, preferenceKey, preference, syncState)
}

func (s *Store) installSynchronized(required State, password string, newDEK []byte, content *model.Content, profiles []model.TerminalProfile, schemes []model.ColorScheme, preferenceKey string, preference any, syncState []byte) error {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != required {
		if required == StateUnlocked {
			return apperr.New(apperr.VaultLocked)
		}
		return apperr.New(apperr.VaultExists)
	}
	if content == nil || preferenceKey == "" || len(newDEK) != KeySize || len(syncState) == 0 || len(syncState) > syncStateMaxSize {
		return apperr.New(apperr.InvalidInput)
	}
	if err := validateNewPassword(password, password); err != nil {
		return err
	}
	preferenceJSON, err := json.Marshal(preference)
	if err != nil {
		return err
	}
	key := append([]byte(nil), newDEK...)
	defer Zero(key)
	createdAt := s.now()
	if required == StateUnlocked && s.meta != nil {
		createdAt = s.meta.createdAt
	}
	metadata, kek, err := s.newMeta(password, key, createdAt)
	if err != nil {
		return err
	}
	defer func() {
		if kek != nil {
			Zero(kek)
		}
	}()
	sealedState, err := Seal(key, syncState, syncStateAD)
	if err != nil {
		return err
	}
	draft := content.Clone()
	pre := func(tx *sql.Tx) error {
		for _, table := range []string{"forward_rules", "hosts", "credentials", "groups", "known_hosts", "vault_settings"} {
			if _, err := tx.Exec(`DELETE FROM ` + table); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(`DELETE FROM terminal_profiles`); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM color_schemes`); err != nil {
			return err
		}
		if err := writeMeta(tx, metadata, nil); err != nil {
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
		if _, err := tx.Exec(`INSERT INTO preferences (key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`, preferenceKey, string(preferenceJSON)); err != nil {
			return err
		}
		_, err := tx.Exec(`INSERT INTO sync_state (id, sealed) VALUES (?, ?)
			ON CONFLICT(id) DO UPDATE SET sealed = excluded.sealed`, syncStateID, sealedState)
		return err
	}
	sigs, err := s.persist(pre, key, nil, draft)
	if err != nil {
		return err
	}
	oldDEK, oldKEK := s.dek, s.kek
	s.dek, s.kek, s.meta, s.content, s.sigs = append([]byte(nil), key...), kek, metadata, draft, sigs
	kek = nil
	Zero(oldDEK)
	Zero(oldKEK)
	if required == StateNonexistent {
		s.setStatus(Status{State: StateUnlocked})
	}
	return nil
}

// Backup cria uma cópia SQLite consistente dentro da pasta de dados. O nome e o destino são
// inteiramente internos; nenhum argumento da ponte vira caminho.
func (s *Store) Backup(now time.Time) (string, error) {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked || s.db == nil {
		return "", apperr.New(apperr.VaultLocked)
	}
	name := "vault-backup-" + now.UTC().Format("20060102-150405") + ".db"
	path := filepath.Join(s.dir, name)
	if _, err := os.Stat(path); err == nil {
		return "", fmt.Errorf("backup already exists")
	} else if !os.IsNotExist(err) {
		return "", err
	}
	if _, err := s.db.Exec(`PRAGMA wal_checkpoint(FULL)`); err != nil {
		return "", err
	}
	if _, err := s.db.Exec(`VACUUM INTO ?`, path); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	if err := restrictFiles(path); err != nil {
		_ = os.Remove(path)
		return "", err
	}
	return path, nil
}

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

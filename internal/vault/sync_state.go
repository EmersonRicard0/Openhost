package vault

import (
	"database/sql"
	"errors"

	"shellvault/internal/apperr"
)

type SyncKeyMaterial struct {
	KDF KDFParams
	DEK []byte
	KEK []byte
}

func (s *Store) SyncKeyMaterial() (SyncKeyMaterial, error) {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked || len(s.dek) != KeySize || len(s.kek) != KeySize || s.meta == nil {
		return SyncKeyMaterial{}, apperr.New(apperr.VaultLocked)
	}
	params := s.meta.kdf()
	params.Salt = append([]byte(nil), params.Salt...)
	return SyncKeyMaterial{KDF: params, DEK: append([]byte(nil), s.dek...), KEK: append([]byte(nil), s.kek...)}, nil
}

const (
	syncStateID      = 1
	syncStateMaxSize = 32 << 20
)

var syncStateAD = []byte("sync_state:1")

// SyncState devolve uma cópia do estado opaco da sincronização. nil significa que a conta não
// está ligada; o formato JSON pertence ao pacote cloudsync e nunca é interpretado pelo cofre.
func (s *Store) SyncState() ([]byte, error) {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked {
		return nil, apperr.New(apperr.VaultLocked)
	}
	return s.syncStateLocked()
}

func (s *Store) syncStateLocked() ([]byte, error) {
	var sealed []byte
	err := s.db.QueryRow(`SELECT sealed FROM sync_state WHERE id = ?`, syncStateID).Scan(&sealed)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	plain, err := Unseal(s.dek, sealed, syncStateAD)
	if err != nil || len(plain) > syncStateMaxSize {
		Zero(plain)
		return nil, apperr.New(apperr.VaultUnreadable)
	}
	return plain, nil
}

func (s *Store) SetSyncState(value []byte) error {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked {
		return apperr.New(apperr.VaultLocked)
	}
	if len(value) > syncStateMaxSize {
		return apperr.New(apperr.InvalidInput)
	}
	sealed, err := Seal(s.dek, value, syncStateAD)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`INSERT INTO sync_state (id, sealed) VALUES (?, ?)
		ON CONFLICT(id) DO UPDATE SET sealed = excluded.sealed`, syncStateID, sealed)
	return err
}

// ClearSyncState desliga a sincronização sem alterar nenhum conteúdo do cofre.
func (s *Store) ClearSyncState() error {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked {
		return apperr.New(apperr.VaultLocked)
	}
	_, err := s.db.Exec(`DELETE FROM sync_state WHERE id = ?`, syncStateID)
	return err
}

// ValidatePasswordChange confere a senha atual e as regras da nova senha sem alterar o cofre.
// O sincronizador usa esta etapa antes de publicar um chaveiro de época nova.
func (s *Store) ValidatePasswordChange(current, next, confirmation string) error {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked || s.meta == nil {
		return apperr.New(apperr.VaultLocked)
	}
	check, err := unwrap(current, s.meta)
	if err != nil {
		return err
	}
	Zero(check)
	return validateNewPassword(next, confirmation)
}

// Rekey embrulha a nova DEK com password e recifra, numa única transação, todas as linhas
// secretas e sync_state. A memória só muda depois do commit.
func (s *Store) Rekey(password string, newDEK []byte) error {
	return s.rekey(password, newDEK, nil, false)
}

// RekeySynchronized recifra o cofre e substitui o estado de sincronização na mesma transação.
// É usado ao rotacionar/adotar uma época para que DEK e epoch nunca fiquem divergentes no disco.
func (s *Store) RekeySynchronized(password string, newDEK, syncState []byte) error {
	if len(syncState) == 0 || len(syncState) > syncStateMaxSize {
		return apperr.New(apperr.InvalidInput)
	}
	return s.rekey(password, newDEK, syncState, true)
}

func (s *Store) rekey(password string, newDEK, replacementState []byte, replaceState bool) error {
	s.mu.Lock()
	defer s.unlockAndNotify()
	if s.status.State != StateUnlocked {
		return apperr.New(apperr.VaultLocked)
	}
	if len(newDEK) != KeySize || len(s.dek) != KeySize {
		return apperr.New(apperr.InvalidInput)
	}
	if err := validateNewPassword(password, password); err != nil {
		return err
	}
	newKey := append([]byte(nil), newDEK...)
	defer Zero(newKey)
	newMeta, newKEK, err := s.newMeta(password, newKey, s.meta.createdAt)
	if err != nil {
		return err
	}
	defer func() {
		if newKEK != nil {
			Zero(newKEK)
		}
	}()
	var state []byte
	if replaceState {
		state = append([]byte(nil), replacementState...)
	} else {
		state, err = s.syncStateLocked()
		if err != nil {
			return err
		}
	}
	defer Zero(state)
	rows, err := encodeContent(s.content)
	if err != nil {
		return err
	}
	defer func() {
		for _, tableRows := range rows {
			for _, item := range tableRows {
				Zero(item.plain)
			}
		}
	}()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	fail := func(cause error) error {
		_ = tx.Rollback()
		return cause
	}
	if _, err := tx.Exec(`PRAGMA defer_foreign_keys = ON`); err != nil {
		return fail(err)
	}
	if err := writeMeta(tx, newMeta, nil); err != nil {
		return fail(err)
	}
	for _, table := range tables {
		statement := upsertSQL(table)
		for id, item := range rows[table.name] {
			sealed, err := Seal(newKey, item.plain, ad(table.name, id))
			if err != nil {
				return fail(err)
			}
			arguments := append(append([]any{id}, item.cols...), sealed)
			if _, err := tx.Exec(statement, arguments...); err != nil {
				return fail(err)
			}
		}
	}
	if state != nil {
		sealed, err := Seal(newKey, state, syncStateAD)
		if err != nil {
			return fail(err)
		}
		if _, err := tx.Exec(`INSERT INTO sync_state (id, sealed) VALUES (?, ?)
			ON CONFLICT(id) DO UPDATE SET sealed = excluded.sealed`, syncStateID, sealed); err != nil {
			return fail(err)
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	oldKey := s.dek
	oldKEK := s.kek
	s.dek = append([]byte(nil), newKey...)
	s.kek, s.meta = newKEK, newMeta
	newKEK = nil
	Zero(oldKey)
	Zero(oldKEK)
	return nil
}

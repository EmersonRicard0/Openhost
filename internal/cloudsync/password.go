package cloudsync

import (
	"context"
	"encoding/json"

	"shellvault/internal/apperr"
	"shellvault/internal/vault"
)

// ChangePassword rotaciona a DEK e a época quando a sincronização está ligada. Sem conta
// conectada, preserva o comportamento local do cofre.
func (s *Syncer) ChangePassword(ctx context.Context, current, next, confirmation string) error {
	s.mu.Lock()
	loaded := s.loaded
	s.mu.Unlock()
	if !loaded {
		return s.store.ChangePassword(current, next, confirmation)
	}
	if err := s.store.ValidatePasswordChange(current, next, confirmation); err != nil {
		return err
	}
	s.opMu.Lock()
	s.mu.Lock()
	state, drive := s.state, s.drive
	s.mu.Unlock()
	if drive == nil || s.store.Status().State != vault.StateUnlocked {
		s.opMu.Unlock()
		return apperr.New(apperr.InvalidInput)
	}
	file, raw, err := readSingleKeyring(ctx, drive)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	keys, ring, err := OpenKeyring(current, raw)
	if err != nil {
		// Se o chaveiro já foi publicado mas a recifragem local falhou (queda, bloqueio ou
		// erro de disco), repetir o diálogo com os mesmos valores conclui a adoção com segurança.
		if apperr.CodeOf(err) != apperr.VaultBadPassword {
			s.opMu.Unlock()
			return err
		}
		keys, ring, err = OpenKeyring(next, raw)
		if err != nil || ring.Epoch <= state.Epoch || len(keys[ring.Epoch]) != vault.KeySize {
			zeroKeys(keys)
			s.opMu.Unlock()
			return apperr.New(apperr.VaultBadPassword)
		}
		defer zeroKeys(keys)
		state.Epoch, state.EpochKeys, state.Dirty, state.ForceUpload = ring.Epoch, cloneEpochKeys(keys), true, true
		stateJSON, marshalErr := json.Marshal(state)
		if marshalErr != nil {
			s.opMu.Unlock()
			return marshalErr
		}
		defer vault.Zero(stateJSON)
		if err := s.store.RekeySynchronized(next, keys[ring.Epoch], stateJSON); err != nil {
			s.opMu.Unlock()
			return err
		}
		s.mu.Lock()
		oldKeys := s.state.EpochKeys
		s.state = state
		s.mu.Unlock()
		zeroKeys(oldKeys)
		s.opMu.Unlock()
		s.updateInfo(SyncStatePending, 1, nil)
		return s.sync(ctx)
	}
	defer zeroKeys(keys)
	if ring.Epoch != state.Epoch {
		s.opMu.Unlock()
		if ring.Epoch > state.Epoch {
			s.updateInfo(SyncStateNeedsPassword, 0, nil)
		}
		return apperr.New(apperr.InvalidInput)
	}
	newDEK := vault.RandomKey()
	defer vault.Zero(newDEK)
	newEpoch := ring.Epoch + 1
	keys[newEpoch] = append([]byte(nil), newDEK...)
	params := vault.KDFParams{Time: ring.KDF.Time, MemoryKiB: ring.KDF.MemoryKiB, Salt: vault.RandomSalt()}
	sealed, err := SealKeyring(next, params, newEpoch, keys)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	if err := drive.UpdateKeyring(ctx, file.ID, sealed); err != nil {
		s.opMu.Unlock()
		return err
	}
	state.Epoch, state.EpochKeys, state.Dirty, state.ForceUpload = newEpoch, cloneEpochKeys(keys), true, true
	stateJSON, err := json.Marshal(state)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	defer vault.Zero(stateJSON)
	if err := s.store.RekeySynchronized(next, newDEK, stateJSON); err != nil {
		s.opMu.Unlock()
		return err
	}
	s.mu.Lock()
	oldKeys := s.state.EpochKeys
	s.state = state
	s.mu.Unlock()
	zeroKeys(oldKeys)
	s.opMu.Unlock()
	s.updateInfo(SyncStatePending, 1, nil)
	return s.sync(ctx)
}

// ProvidePassword abre o chaveiro da nova época, junta qualquer mudança local pendente e adota
// a DEK nova. Senha errada não toca o cofre local.
func (s *Syncer) ProvidePassword(ctx context.Context, password string) error {
	if password == "" {
		return apperr.New(apperr.InvalidInput)
	}
	s.opMu.Lock()
	s.mu.Lock()
	state, drive, loaded, phase := s.state, s.drive, s.loaded, s.info.State
	s.mu.Unlock()
	if !loaded || drive == nil || phase != SyncStateNeedsPassword || s.store.Status().State != vault.StateUnlocked {
		s.opMu.Unlock()
		return apperr.New(apperr.InvalidInput)
	}
	_, keyringBytes, err := readSingleKeyring(ctx, drive)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	keys, ring, err := OpenKeyring(password, keyringBytes)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	defer zeroKeys(keys)
	if ring.Epoch <= state.Epoch || len(keys[ring.Epoch]) != vault.KeySize {
		s.opMu.Unlock()
		return apperr.New(apperr.CloudCorrupt)
	}
	snapshots, err := drive.List(ctx, SnapshotFiles, 1)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	if len(snapshots) == 0 {
		s.opMu.Unlock()
		return apperr.New(apperr.CloudEmpty)
	}
	snapshotBytes, err := drive.Get(ctx, snapshots[0].ID)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	header, remote, err := OpenSnapshot(snapshotBytes, keys)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	if header.Epoch != ring.Epoch {
		s.opMu.Unlock()
		return apperr.New(apperr.CloudCorrupt)
	}
	local, _, _, err := s.localVersions(&state)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	merged, err := Merge(local, remote.Items, s.options.Now().UTC())
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	data, err := decodeVersions(merged.Items)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	state.Epoch, state.EpochKeys = ring.Epoch, cloneEpochKeys(keys)
	state.Lamport = max(state.Lamport, header.Lamport)
	state.Base = snapshots[0].Name
	state.Items = itemStates(merged.Items)
	state.Conflicts = reconcileConflicts(state.Conflicts, merged.Conflicts, merged.Items)
	state.Dirty = !sameVersions(merged.Items, remote.Items)
	state.ForceUpload = state.Dirty
	state.LastSync = s.nowString()
	stateJSON, err := json.Marshal(state)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	defer vault.Zero(stateJSON)
	preferences, err := s.preferences.Get()
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	if err := s.store.ReplaceSynchronized(password, keys[ring.Epoch], data.Content, data.Profiles, data.Schemes,
		"preferences", ApplySyncPreferences(preferences, data.Preferences), stateJSON); err != nil {
		s.opMu.Unlock()
		return err
	}
	s.mu.Lock()
	oldKeys := s.state.EpochKeys
	s.state = state
	s.mu.Unlock()
	zeroKeys(oldKeys)
	s.opMu.Unlock()
	if len(state.Conflicts) != 0 {
		s.updateInfo(SyncStateConflict, 0, nil)
	} else if state.Dirty {
		s.updateInfo(SyncStatePending, 1, nil)
	} else {
		s.updateInfo(SyncStateSynced, 0, nil)
	}
	if state.Dirty {
		return s.sync(ctx)
	}
	return nil
}

func readSingleKeyring(ctx context.Context, drive *Drive) (DriveFile, []byte, error) {
	files, err := drive.List(ctx, KeyringFiles, 2)
	if err != nil {
		return DriveFile{}, nil, err
	}
	if len(files) == 0 {
		return DriveFile{}, nil, apperr.New(apperr.CloudEmpty)
	}
	if len(files) != 1 {
		return DriveFile{}, nil, apperr.New(apperr.CloudCorrupt)
	}
	raw, err := drive.Get(ctx, files[0].ID)
	return files[0], raw, err
}

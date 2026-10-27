package cloudsync

import (
	"context"
	"sort"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/vault"
)

const (
	retainedSnapshotCount = 30
	retainedSnapshotAge   = 30 * 24 * time.Hour
)

type CloudVersion struct {
	Name       string `json:"name"`
	CreatedAt  string `json:"createdAt"`
	DeviceName string `json:"deviceName"`
	Items      int    `json:"items"`
}

type RevokeFunc func(context.Context, string) error

// Versions abre somente as 30 versões mais novas e registra internamente os nomes autorizados
// para RestoreVersion. Nenhum nome vindo da ponte vira consulta ou caminho.
func (s *Syncer) Versions(ctx context.Context) ([]CloudVersion, error) {
	s.opMu.Lock()
	defer s.opMu.Unlock()
	if s.store.Status().State != vault.StateUnlocked {
		return nil, apperr.New(apperr.VaultLocked)
	}
	s.mu.Lock()
	state, drive, loaded := s.state, s.drive, s.loaded
	s.mu.Unlock()
	if !loaded || drive == nil {
		return nil, apperr.New(apperr.NotFound)
	}
	files, err := drive.List(ctx, SnapshotFiles, retainedSnapshotCount)
	if err != nil {
		return nil, err
	}
	keys, err := s.snapshotKeys(state)
	if err != nil {
		return nil, err
	}
	defer zeroKeys(keys)
	versions := make([]CloudVersion, 0, len(files))
	allowed := make(map[string]DriveFile, len(files))
	for _, file := range files {
		if _, duplicate := allowed[file.Name]; duplicate {
			return nil, apperr.New(apperr.CloudCorrupt)
		}
		_, body, err := s.openVersion(ctx, drive, file, keys)
		if err != nil {
			return nil, err
		}
		versions = append(versions, CloudVersion{Name: file.Name, CreatedAt: body.CreatedAt, DeviceName: body.DeviceName, Items: activeItemCount(body.Items)})
		allowed[file.Name] = file
	}
	s.mu.Lock()
	s.listedVersions = allowed
	s.mu.Unlock()
	return versions, nil
}

// RestoreVersion restaura o conteúdo inteiro de uma versão da última listagem e cria uma nova
// versão dominante, preservando a possibilidade de desfazer a própria restauração.
func (s *Syncer) RestoreVersion(ctx context.Context, name string) error {
	s.opMu.Lock()
	if s.store.Status().State != vault.StateUnlocked {
		s.opMu.Unlock()
		return apperr.New(apperr.VaultLocked)
	}
	s.mu.Lock()
	state, drive, loaded := s.state, s.drive, s.loaded
	selected, allowed := s.listedVersions[name]
	s.mu.Unlock()
	if !loaded || drive == nil || !allowed {
		s.opMu.Unlock()
		return apperr.New(apperr.NotFound)
	}
	keys, err := s.snapshotKeys(state)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	defer zeroKeys(keys)
	selectedHeader, selectedBody, err := s.openVersion(ctx, drive, selected, keys)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	latestFiles, err := drive.List(ctx, SnapshotFiles, 1)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	if len(latestFiles) == 0 {
		s.opMu.Unlock()
		return apperr.New(apperr.CloudEmpty)
	}
	latestHeader, latestBody := selectedHeader, selectedBody
	if latestFiles[0].ID != selected.ID {
		latestHeader, latestBody, err = s.openVersion(ctx, drive, latestFiles[0], keys)
		if err != nil {
			s.opMu.Unlock()
			return err
		}
	}
	local, _, _, err := s.localVersions(&state)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	base := joinRestoreBase(local, latestBody.Items, state.Conflicts)
	lamport := max(state.Lamport, max(selectedHeader.Lamport, latestHeader.Lamport))
	restored, err := buildRestoredVersions(base, selectedBody.Items, state.DeviceID, lamport+1, s.options.Now().UTC())
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	if err := s.applyVersions(restored); err != nil {
		s.opMu.Unlock()
		return err
	}
	state.Lamport, state.Base = lamport, latestFiles[0].Name
	state.Items, state.Conflicts = itemStates(restored), []Conflict{}
	state.Dirty, state.ForceUpload = true, true
	if err := s.saveState(state); err != nil {
		s.opMu.Unlock()
		return err
	}
	s.mu.Lock()
	s.state = state
	s.mu.Unlock()
	s.opMu.Unlock()
	s.updateInfo(SyncStatePending, 1, nil)
	return s.sync(ctx)
}

// Disconnect opcionalmente apaga a área do app, revoga a autorização e só então remove o
// estado local de sync. Depois da revogação, loaded=false impede qualquer nova requisição.
func (s *Syncer) Disconnect(ctx context.Context, deleteCloud bool, revoke RevokeFunc) error {
	if revoke == nil {
		return apperr.New(apperr.InvalidInput)
	}
	s.opMu.Lock()
	s.mu.Lock()
	state, drive, loaded := s.state, s.drive, s.loaded
	s.mu.Unlock()
	if !loaded || drive == nil || s.store.Status().State != vault.StateUnlocked {
		s.opMu.Unlock()
		return apperr.New(apperr.NotFound)
	}
	if deleteCloud {
		for {
			files, err := drive.List(ctx, SnapshotFiles, 1000)
			if err != nil {
				s.opMu.Unlock()
				return err
			}
			for _, file := range files {
				if err := drive.Delete(ctx, file.ID); err != nil {
					s.opMu.Unlock()
					return err
				}
			}
			if len(files) < 1000 {
				break
			}
		}
		keyrings, err := drive.List(ctx, KeyringFiles, 2)
		if err != nil {
			s.opMu.Unlock()
			return err
		}
		for _, file := range keyrings {
			if err := drive.Delete(ctx, file.ID); err != nil {
				s.opMu.Unlock()
				return err
			}
		}
	}
	if err := revoke(ctx, state.Account.RefreshToken); err != nil {
		s.opMu.Unlock()
		return err
	}
	if err := s.store.ClearSyncState(); err != nil {
		s.opMu.Unlock()
		return err
	}
	zeroKeys(state.EpochKeys)
	s.mu.Lock()
	s.state, s.drive, s.loaded, s.listedVersions = persistentSyncState{}, nil, false, nil
	s.mu.Unlock()
	s.opMu.Unlock()
	s.updateInfo(SyncStateOff, 0, nil)
	return nil
}

func (s *Syncer) snapshotKeys(state persistentSyncState) (map[int][]byte, error) {
	material, err := s.store.SyncKeyMaterial()
	if err != nil {
		return nil, err
	}
	defer vault.Zero(material.DEK)
	defer vault.Zero(material.KEK)
	keys := cloneEpochKeys(state.EpochKeys)
	keys[state.Epoch] = append([]byte(nil), material.DEK...)
	return keys, nil
}

func (s *Syncer) openVersion(ctx context.Context, drive *Drive, file DriveFile, keys map[int][]byte) (SnapshotHeader, SnapshotBody, error) {
	raw, err := drive.Get(ctx, file.ID)
	if err != nil {
		return SnapshotHeader{}, SnapshotBody{}, err
	}
	header, body, err := OpenSnapshot(raw, keys)
	if err != nil {
		return header, SnapshotBody{}, err
	}
	if _, err := decodeVersions(body.Items); err != nil {
		return header, SnapshotBody{}, err
	}
	return header, body, nil
}

func activeItemCount(items []ItemVersion) int {
	count := 0
	for _, item := range items {
		if !item.Deleted {
			count++
		}
	}
	return count
}

func joinRestoreBase(local, remote []ItemVersion, conflicts []Conflict) map[string]VersionVector {
	result := map[string]VersionVector{}
	join := func(item ItemVersion) { result[item.Key] = joinVectors(result[item.Key], item.VV) }
	for _, item := range local {
		join(item)
	}
	for _, item := range remote {
		join(item)
	}
	for _, conflict := range conflicts {
		join(conflict.Local)
		join(conflict.Remote)
	}
	return result
}

func buildRestoredVersions(base map[string]VersionVector, target []ItemVersion, deviceID string, counter uint64, now time.Time) ([]ItemVersion, error) {
	targetByKey, err := indexVersions(target)
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(base)+len(targetByKey))
	seen := map[string]bool{}
	for key := range base {
		keys, seen[key] = append(keys, key), true
	}
	for key := range targetByKey {
		if !seen[key] {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	result := make([]ItemVersion, 0, len(keys))
	for _, key := range keys {
		chosen, found := targetByKey[key]
		if !found {
			chosen = ItemVersion{Key: key, Deleted: true, DeletedAt: now.Format(time.RFC3339Nano)}
		} else if chosen.Deleted {
			chosen.DeletedAt = now.Format(time.RFC3339Nano)
		}
		chosen.VV = joinVectors(base[key], chosen.VV)
		chosen.VV[deviceID] = max(chosen.VV[deviceID]+1, counter)
		result = append(result, chosen)
	}
	return result, nil
}

func retentionDeletions(files []DriveFile, now time.Time) ([]DriveFile, error) {
	cutoff := now.UTC().Add(-retainedSnapshotAge)
	result := []DriveFile{}
	for index, file := range files {
		created, err := time.Parse(time.RFC3339Nano, file.CreatedTime)
		if err != nil {
			return nil, apperr.New(apperr.CloudCorrupt)
		}
		if index >= retainedSnapshotCount && created.Before(cutoff) {
			result = append(result, file)
		}
	}
	return result, nil
}

func (s *Syncer) pruneSnapshots(ctx context.Context, drive *Drive) error {
	files, err := drive.List(ctx, SnapshotFiles, 1000)
	if err != nil {
		return err
	}
	deletions, err := retentionDeletions(files, s.options.Now())
	if err != nil {
		return err
	}
	for _, file := range deletions {
		if err := drive.Delete(ctx, file.ID); err != nil {
			return err
		}
	}
	return nil
}

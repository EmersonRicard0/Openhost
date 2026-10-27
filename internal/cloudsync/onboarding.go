package cloudsync

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

type openedCloudVault struct {
	file    DriveFile
	keyring Keyring
	header  SnapshotHeader
	body    SnapshotBody
	data    SyncData
	keys    map[int][]byte
}

func (o *openedCloudVault) close() { zeroKeys(o.keys) }

// OpenFromCloud cria o cofre local somente depois que chaveiro, snapshot e todos os itens
// remotos foram autenticados e validados em memória.
func (s *Syncer) OpenFromCloud(ctx context.Context, account SyncAccount, drive *Drive, password string) error {
	if drive == nil || !validOAuthEmail(account.Email) || account.RefreshToken == "" || s.store.Status().State != vault.StateNonexistent {
		return apperr.New(apperr.InvalidInput)
	}
	cloud, err := loadCloudVault(ctx, drive, password)
	if err != nil {
		return err
	}
	defer cloud.close()
	deviceID, err := newDeviceID()
	if err != nil {
		return apperr.New(apperr.Internal)
	}
	state := s.cloudState(account, cloud, cloud.body.Items, cloud.file.Name, false, deviceID)
	stateJSON, err := json.Marshal(state)
	if err != nil {
		return err
	}
	defer vault.Zero(stateJSON)
	preferences, err := s.preferences.Get()
	if err != nil {
		return err
	}
	dek := cloud.keys[cloud.keyring.Epoch]
	if len(dek) != vault.KeySize {
		return apperr.New(apperr.CloudCorrupt)
	}
	if err := s.store.CreateSynchronized(password, dek, cloud.data.Content, cloud.data.Profiles, cloud.data.Schemes,
		"preferences", ApplySyncPreferences(preferences, cloud.data.Preferences), stateJSON); err != nil {
		return err
	}
	s.attachCloud(state, drive)
	return nil
}

// StartFromCloud conclui a escolha feita depois de Connect quando já existe cofre local.
func (s *Syncer) StartFromCloud(ctx context.Context, mode string, account SyncAccount, drive *Drive, password string) error {
	if mode != "replace" && mode != "merge" {
		return apperr.New(apperr.InvalidInput)
	}
	if drive == nil || !validOAuthEmail(account.Email) || account.RefreshToken == "" || s.store.Status().State != vault.StateUnlocked {
		return apperr.New(apperr.InvalidInput)
	}
	cloud, err := loadCloudVault(ctx, drive, password)
	if err != nil {
		return err
	}
	defer cloud.close()
	items := cloud.body.Items
	data := cloud.data
	base := cloud.file.Name
	dirty := false
	conflicts := []Conflict{}
	deviceID, err := newDeviceID()
	if err != nil {
		return apperr.New(apperr.Internal)
	}
	if mode == "merge" {
		local, err := s.localSyncData()
		if err != nil {
			return err
		}
		local = deduplicateLocal(local, cloud.data)
		plain, err := EncodeItems(local)
		if err != nil {
			return err
		}
		localVersions := make([]ItemVersion, 0, len(plain))
		counter := cloud.header.Lamport + 1
		for _, item := range plain {
			localVersions = append(localVersions, ItemVersion{Key: item.Key, VV: VersionVector{deviceID: counter}, Data: append(json.RawMessage(nil), item.Data...)})
		}
		merged, err := Merge(localVersions, cloud.body.Items, s.options.Now().UTC())
		if err != nil {
			return err
		}
		data, err = decodeVersions(merged.Items)
		if err != nil {
			return err
		}
		items, conflicts, base, dirty = merged.Items, merged.Conflicts, "", true
	}
	state := s.cloudState(account, cloud, items, base, dirty, deviceID)
	state.Conflicts = conflicts
	stateJSON, err := json.Marshal(state)
	if err != nil {
		return err
	}
	defer vault.Zero(stateJSON)
	preferences, err := s.preferences.Get()
	if err != nil {
		return err
	}
	if mode == "replace" {
		if _, err := s.store.Backup(s.options.Now()); err != nil {
			return err
		}
	}
	dek := cloud.keys[cloud.keyring.Epoch]
	if len(dek) != vault.KeySize {
		return apperr.New(apperr.CloudCorrupt)
	}
	if err := s.store.ReplaceSynchronized(password, dek, data.Content, data.Profiles, data.Schemes,
		"preferences", ApplySyncPreferences(preferences, data.Preferences), stateJSON); err != nil {
		return err
	}
	s.attachCloud(state, drive)
	if mode == "merge" {
		return s.sync(ctx)
	}
	return nil
}

func loadCloudVault(ctx context.Context, drive *Drive, password string) (*openedCloudVault, error) {
	keyrings, err := drive.List(ctx, KeyringFiles, 2)
	if err != nil {
		return nil, err
	}
	if len(keyrings) == 0 {
		return nil, apperr.New(apperr.CloudEmpty)
	}
	if len(keyrings) != 1 {
		return nil, apperr.New(apperr.CloudCorrupt)
	}
	keyringBytes, err := drive.Get(ctx, keyrings[0].ID)
	if err != nil {
		return nil, err
	}
	keys, keyring, err := OpenKeyring(password, keyringBytes)
	if err != nil {
		return nil, err
	}
	fail := func(cause error) (*openedCloudVault, error) { zeroKeys(keys); return nil, cause }
	snapshots, err := drive.List(ctx, SnapshotFiles, 1)
	if err != nil {
		return fail(err)
	}
	if len(snapshots) == 0 {
		return fail(apperr.New(apperr.CloudEmpty))
	}
	snapshotBytes, err := drive.Get(ctx, snapshots[0].ID)
	if err != nil {
		return fail(err)
	}
	header, body, err := OpenSnapshot(snapshotBytes, keys)
	if err != nil {
		return fail(err)
	}
	data, err := decodeVersions(body.Items)
	if err != nil {
		return fail(err)
	}
	return &openedCloudVault{file: snapshots[0], keyring: keyring, header: header, body: body, data: data, keys: keys}, nil
}

func decodeVersions(items []ItemVersion) (SyncData, error) {
	if _, err := indexVersions(items); err != nil {
		return SyncData{}, err
	}
	plain := make([]PlainItem, 0, len(items))
	for _, item := range items {
		if item.Deleted {
			continue
		}
		plain = append(plain, PlainItem{Key: item.Key, Hash: StableItemHash(item.Data), Data: append(json.RawMessage(nil), item.Data...)})
	}
	data, rejected, err := DecodeItems(plain)
	if err != nil || len(rejected) != 0 {
		return SyncData{}, apperr.New(apperr.CloudCorrupt)
	}
	return data, nil
}

func (s *Syncer) cloudState(account SyncAccount, cloud *openedCloudVault, items []ItemVersion, base string, dirty bool, deviceID string) persistentSyncState {
	deviceName := s.options.DeviceName()
	if !validDeviceName(deviceName) {
		deviceName = "Este computador"
	}
	if account.ConnectedAt == "" {
		account.ConnectedAt = s.nowString()
	}
	return persistentSyncState{Account: account, DeviceID: deviceID, DeviceName: deviceName,
		Epoch: cloud.keyring.Epoch, EpochKeys: cloneEpochKeys(cloud.keys), Lamport: cloud.header.Lamport, Base: base, Items: itemStates(items),
		Conflicts: []Conflict{}, Dirty: dirty, LastSync: s.nowString()}
}

func (s *Syncer) attachCloud(state persistentSyncState, drive *Drive) {
	s.mu.Lock()
	oldKeys := s.state.EpochKeys
	s.state, s.drive, s.loaded = state, drive, true
	s.mu.Unlock()
	zeroKeys(oldKeys)
	phase := SyncStateSynced
	if len(state.Conflicts) != 0 {
		phase = SyncStateConflict
	} else if state.Dirty {
		phase = SyncStatePending
	}
	s.updateInfo(phase, 0, nil)
}

func (s *Syncer) localSyncData() (SyncData, error) {
	content, err := s.store.Read()
	if err != nil {
		return SyncData{}, err
	}
	profiles, err := s.store.TerminalProfiles()
	if err != nil {
		return SyncData{}, err
	}
	schemes, err := s.store.ColorSchemes()
	if err != nil {
		return SyncData{}, err
	}
	preferences, err := s.preferences.Get()
	if err != nil {
		return SyncData{}, err
	}
	return SyncData{Content: content, Profiles: profiles, Schemes: schemes, Preferences: SyncPreferencesFrom(preferences)}, nil
}

// deduplicateLocal elimina somente as equivalências de conteúdo definidas em R6. O item remoto
// é mantido para preservar seus ids e vetores; referências locais são reescritas para ele.
func deduplicateLocal(local, remote SyncData) SyncData {
	local.Content = local.Content.Clone()
	groupMap := map[string]string{}
	remoteGroups := map[string]string{}
	for _, group := range remote.Content.Groups {
		remoteGroups[groupContentKey(group.Name, group.ParentID)] = group.ID
	}
	for range local.Content.Groups {
		changed := false
		for _, group := range local.Content.Groups {
			if _, known := groupMap[group.ID]; known {
				continue
			}
			parent := remapID(group.ParentID, groupMap)
			if id, found := remoteGroups[groupContentKey(group.Name, parent)]; found {
				groupMap[group.ID], changed = id, true
			}
		}
		if !changed {
			break
		}
	}
	groups := local.Content.Groups[:0]
	for _, group := range local.Content.Groups {
		if _, duplicate := groupMap[group.ID]; duplicate {
			continue
		}
		group.ParentID = remapID(group.ParentID, groupMap)
		groups = append(groups, group)
	}
	local.Content.Groups = groups

	credentialMap := map[string]string{}
	remoteCredentials := map[string]string{}
	for _, credential := range remote.Content.Credentials {
		remoteCredentials[credentialContentKey(credential)] = credential.ID
	}
	credentials := local.Content.Credentials[:0]
	for _, credential := range local.Content.Credentials {
		if id, found := remoteCredentials[credentialContentKey(credential)]; found {
			credentialMap[credential.ID] = id
			continue
		}
		credentials = append(credentials, credential)
	}
	local.Content.Credentials = credentials

	hostMap := map[string]string{}
	remoteHosts := map[string]string{}
	for _, host := range remote.Content.Hosts {
		remoteHosts[hostContentKey(host)] = host.ID
	}
	hosts := local.Content.Hosts[:0]
	for _, host := range local.Content.Hosts {
		host.GroupID = remapID(host.GroupID, groupMap)
		host.CredentialID = remapID(host.CredentialID, credentialMap)
		if id, found := remoteHosts[hostContentKey(host)]; found {
			hostMap[host.ID] = id
			continue
		}
		hosts = append(hosts, host)
	}
	local.Content.Hosts = hosts
	for index := range local.Content.ForwardRules {
		if id, found := hostMap[local.Content.ForwardRules[index].HostID]; found {
			local.Content.ForwardRules[index].HostID = id
		}
	}
	return local
}

func groupContentKey(name string, parentID *string) string {
	parent := ""
	if parentID != nil {
		parent = *parentID
	}
	return strings.ToLower(strings.TrimSpace(name)) + "\x00" + parent
}

func credentialContentKey(value model.Credential) string {
	passphrase := ""
	if value.Passphrase != nil {
		passphrase = *value.Passphrase
	}
	return string(value.Kind) + "\x00" + value.Password + "\x00" + value.PrivateKey + "\x00" + passphrase
}

func hostContentKey(value model.Host) string {
	return strings.ToLower(domain.NormalizeAddress(value.Address)) + fmt.Sprintf("\x00%d\x00", value.Port) + value.Username
}

func remapID(value *string, mappings map[string]string) *string {
	if value == nil {
		return nil
	}
	if mapped, found := mappings[*value]; found {
		return model.Ptr(mapped)
	}
	return model.Ptr(*value)
}

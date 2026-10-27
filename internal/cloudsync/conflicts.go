package cloudsync

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"shellvault/internal/apperr"
	"shellvault/internal/vault"
)

const maskedSecret = "••••"

type ConflictField struct {
	Field string `json:"field"`
	Value string `json:"value"`
}

type ConflictSide struct {
	Deleted bool            `json:"deleted"`
	Summary []ConflictField `json:"summary"`
}

type ConflictView struct {
	Key    string       `json:"key"`
	Kind   string       `json:"kind"`
	Label  string       `json:"label"`
	Local  ConflictSide `json:"local"`
	Remote ConflictSide `json:"remote"`
}

// Conflicts devolve somente uma projeção segura para a ponte. Os ItemVersion completos,
// inclusive segredos, continuam selados dentro de sync_state e nunca chegam ao frontend.
func (s *Syncer) Conflicts() ([]ConflictView, error) {
	if s.store.Status().State != vault.StateUnlocked {
		return nil, apperr.New(apperr.VaultLocked)
	}
	s.mu.Lock()
	if !s.loaded {
		s.mu.Unlock()
		return []ConflictView{}, nil
	}
	conflicts := cloneConflicts(s.state.Conflicts)
	s.mu.Unlock()
	views := make([]ConflictView, 0, len(conflicts))
	for _, conflict := range conflicts {
		kind, _, ok := strings.Cut(conflict.Key, ":")
		if !ok || !knownItemKind(kind) {
			return nil, apperr.New(apperr.CloudCorrupt)
		}
		local, localLabel, err := conflictSideView(kind, conflict.Local)
		if err != nil {
			return nil, err
		}
		remote, remoteLabel, err := conflictSideView(kind, conflict.Remote)
		if err != nil {
			return nil, err
		}
		label := localLabel
		if label == "" {
			label = remoteLabel
		}
		if label == "" {
			_, label, _ = strings.Cut(conflict.Key, ":")
		}
		views = append(views, ConflictView{Key: conflict.Key, Kind: kind, Label: label, Local: local, Remote: remote})
	}
	return views, nil
}

// Resolve transforma a escolha em uma versão que domina os dois lados do conflito e a envia.
func (s *Syncer) Resolve(ctx context.Context, key, keep string) error {
	if (keep != "local" && keep != "remote") || key == "" || len(key) > 512 {
		return apperr.New(apperr.InvalidInput)
	}
	s.opMu.Lock()
	if s.store.Status().State != vault.StateUnlocked {
		s.opMu.Unlock()
		return apperr.New(apperr.VaultLocked)
	}
	s.mu.Lock()
	state, loaded := s.state, s.loaded
	s.mu.Unlock()
	if !loaded {
		s.opMu.Unlock()
		return apperr.New(apperr.NotFound)
	}
	index := -1
	var conflict Conflict
	for i, candidate := range state.Conflicts {
		if candidate.Key == key {
			index, conflict = i, candidate
			break
		}
	}
	if index < 0 {
		s.opMu.Unlock()
		return apperr.New(apperr.NotFound)
	}
	versions, _, _, err := s.localVersions(&state)
	if err != nil {
		s.opMu.Unlock()
		return err
	}
	chosen := cloneVersion(conflict.Local)
	if keep == "remote" {
		chosen = cloneVersion(conflict.Remote)
	}
	chosen.VV = joinVectors(conflict.Local.VV, conflict.Remote.VV)
	chosen.VV[state.DeviceID] = max(chosen.VV[state.DeviceID]+1, state.Lamport+1)
	versions = replaceVersion(versions, chosen)
	if err := s.applyVersions(versions); err != nil {
		s.opMu.Unlock()
		return err
	}
	state.Conflicts = append(append([]Conflict{}, state.Conflicts[:index]...), state.Conflicts[index+1:]...)
	state.Items, state.Dirty, state.ForceUpload = itemStates(versions), true, true
	if err := s.saveState(state); err != nil {
		s.opMu.Unlock()
		return err
	}
	s.mu.Lock()
	s.state = state
	s.mu.Unlock()
	s.opMu.Unlock()
	if len(state.Conflicts) != 0 {
		s.updateInfo(SyncStateConflict, 1, nil)
	} else {
		s.updateInfo(SyncStatePending, 1, nil)
	}
	return s.sync(ctx)
}

func conflictSideView(kind string, item ItemVersion) (ConflictSide, string, error) {
	side := ConflictSide{Deleted: item.Deleted, Summary: []ConflictField{}}
	if item.Deleted {
		return side, "", nil
	}
	var fields map[string]any
	if json.Unmarshal(item.Data, &fields) != nil {
		return ConflictSide{}, "", apperr.New(apperr.CloudCorrupt)
	}
	label := conflictLabel(kind, fields)
	keys := make([]string, 0, len(fields))
	for key := range fields {
		if key != "id" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := fields[key]
		if key == "password" || key == "passphrase" || key == "privateKey" {
			if value != nil && fmt.Sprint(value) != "" {
				side.Summary = append(side.Summary, ConflictField{Field: conflictFieldLabel(key), Value: maskedSecret})
			}
			continue
		}
		side.Summary = append(side.Summary, ConflictField{Field: conflictFieldLabel(key), Value: conflictValue(value)})
	}
	return side, label, nil
}

func conflictLabel(kind string, fields map[string]any) string {
	for _, key := range []string{"label", "name", "endpoint"} {
		if value, ok := fields[key].(string); ok && value != "" {
			return value
		}
	}
	switch kind {
	case "forward":
		if host, ok := fields["destHost"].(string); ok {
			return host
		}
	case "settings":
		return "Configurações"
	case "prefs":
		return "Preferências"
	}
	return ""
}

func conflictValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case float64:
		return fmt.Sprintf("%g", typed)
	default:
		raw, _ := json.Marshal(typed)
		return string(raw)
	}
}

func conflictFieldLabel(field string) string {
	labels := map[string]string{
		"label": "Rótulo", "name": "Nome", "address": "Endereço", "port": "Porta",
		"username": "Usuário", "authMethod": "Autenticação", "password": "Senha",
		"privateKey": "Chave privada", "passphrase": "Frase secreta", "kind": "Tipo",
		"endpoint": "Destino", "fingerprint": "Impressão digital", "keyType": "Tipo de chave",
		"bindAddress": "Endereço local", "bindPort": "Porta local", "destHost": "Destino",
		"destPort": "Porta de destino", "parentId": "Grupo pai", "hostId": "Host",
		"groupId": "Grupo", "credentialId": "Credencial", "profileId": "Perfil",
	}
	if label := labels[field]; label != "" {
		return label
	}
	return field
}

func replaceVersion(items []ItemVersion, replacement ItemVersion) []ItemVersion {
	result := make([]ItemVersion, 0, len(items)+1)
	found := false
	for _, item := range items {
		if item.Key == replacement.Key {
			result, found = append(result, cloneVersion(replacement)), true
		} else {
			result = append(result, cloneVersion(item))
		}
	}
	if !found {
		result = append(result, cloneVersion(replacement))
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Key < result[j].Key })
	return result
}

func cloneConflicts(conflicts []Conflict) []Conflict {
	result := make([]Conflict, len(conflicts))
	for index, conflict := range conflicts {
		conflict.Local, conflict.Remote = cloneVersion(conflict.Local), cloneVersion(conflict.Remote)
		result[index] = conflict
	}
	return result
}

func reconcileConflicts(existing, discovered []Conflict, items []ItemVersion) []Conflict {
	byKey := make(map[string]Conflict, len(existing)+len(discovered))
	for _, conflict := range discovered {
		byKey[conflict.Key] = conflict
	}
	versions, _ := indexVersions(items)
	for _, conflict := range existing {
		if _, replaced := byKey[conflict.Key]; replaced {
			continue
		}
		item, found := versions[conflict.Key]
		if found && VectorDominatesOrEquals(item.VV, conflict.Local.VV) && VectorDominatesOrEquals(item.VV, conflict.Remote.VV) {
			continue
		}
		byKey[conflict.Key] = conflict
	}
	keys := make([]string, 0, len(byKey))
	for key := range byKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	result := make([]Conflict, 0, len(keys))
	for _, key := range keys {
		result = append(result, byKey[key])
	}
	return result
}

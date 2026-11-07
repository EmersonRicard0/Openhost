package cloudsync

import (
	"encoding/json"
	"sort"
	"strings"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

const tombstoneLifetime = 180 * 24 * time.Hour

type Conflict struct {
	Key        string      `json:"key"`
	Local      ItemVersion `json:"local"`
	Remote     ItemVersion `json:"remote"`
	DetectedAt string      `json:"detectedAt"`
}

type MergeResult struct {
	Items     []ItemVersion
	Conflicts []Conflict
}

type vectorRelation int

const (
	vectorsEqual vectorRelation = iota
	leftDominates
	rightDominates
	vectorsConcurrent
)

func Merge(local, remote []ItemVersion, now time.Time) (MergeResult, error) {
	localByKey, err := indexVersions(local)
	if err != nil {
		return MergeResult{}, err
	}
	remoteByKey, err := indexVersions(remote)
	if err != nil {
		return MergeResult{}, err
	}
	keys := make([]string, 0, len(localByKey)+len(remoteByKey))
	seen := make(map[string]struct{}, len(localByKey)+len(remoteByKey))
	for key := range localByKey {
		seen[key] = struct{}{}
		keys = append(keys, key)
	}
	for key := range remoteByKey {
		if _, found := seen[key]; !found {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	result := MergeResult{Items: make([]ItemVersion, 0, len(keys)), Conflicts: []Conflict{}}
	conflicted := make(map[string]struct{})
	for _, key := range keys {
		localItem, hasLocal := localByKey[key]
		remoteItem, hasRemote := remoteByKey[key]
		switch {
		case !hasLocal:
			result.Items = append(result.Items, cloneVersion(remoteItem))
		case !hasRemote:
			result.Items = append(result.Items, cloneVersion(localItem))
		default:
			relation := compareVectors(localItem.VV, remoteItem.VV)
			localHash, remoteHash := versionHash(localItem), versionHash(remoteItem)
			switch relation {
			case leftDominates:
				result.Items = append(result.Items, cloneVersion(localItem))
			case rightDominates:
				result.Items = append(result.Items, cloneVersion(remoteItem))
			case vectorsEqual:
				if localHash == remoteHash {
					result.Items = append(result.Items, cloneVersion(localItem))
				} else {
					result.Items = append(result.Items, cloneVersion(localItem))
					result.Conflicts = append(result.Conflicts, newConflict(localItem, remoteItem, now))
					conflicted[key] = struct{}{}
				}
			case vectorsConcurrent:
				if localHash == remoteHash {
					merged := cloneVersion(localItem)
					merged.VV = joinVectors(localItem.VV, remoteItem.VV)
					if merged.Deleted && remoteItem.DeletedAt > merged.DeletedAt {
						merged.DeletedAt = remoteItem.DeletedAt
					}
					result.Items = append(result.Items, merged)
				} else {
					result.Items = append(result.Items, cloneVersion(localItem))
					result.Conflicts = append(result.Conflicts, newConflict(localItem, remoteItem, now))
					conflicted[key] = struct{}{}
				}
			}
		}
	}
	result.Items = repairDependencies(result.Items, result.Conflicts)
	kept := result.Items[:0]
	for _, item := range result.Items {
		_, hasConflict := conflicted[item.Key]
		if item.Deleted && !hasConflict {
			deletedAt, _ := time.Parse(time.RFC3339Nano, item.DeletedAt)
			if now.Sub(deletedAt) > tombstoneLifetime {
				continue
			}
		}
		kept = append(kept, item)
	}
	result.Items = kept
	sort.Slice(result.Items, func(i, j int) bool { return result.Items[i].Key < result.Items[j].Key })
	sort.Slice(result.Conflicts, func(i, j int) bool { return result.Conflicts[i].Key < result.Conflicts[j].Key })
	return result, nil
}

func indexVersions(items []ItemVersion) (map[string]ItemVersion, error) {
	result := make(map[string]ItemVersion, len(items))
	for _, item := range items {
		if !validMergeVersion(item) {
			return nil, apperr.New(apperr.CloudCorrupt)
		}
		if _, duplicate := result[item.Key]; duplicate {
			return nil, apperr.New(apperr.CloudCorrupt)
		}
		result[item.Key] = cloneVersion(item)
	}
	return result, nil
}

func validMergeVersion(item ItemVersion) bool {
	kind, id, ok := strings.Cut(item.Key, ":")
	if !ok || id == "" || len(item.Key) > 512 || !knownItemKind(kind) || len(item.VV) == 0 {
		return false
	}
	for device, counter := range item.VV {
		if !deviceIDPattern.MatchString(device) || counter == 0 {
			return false
		}
	}
	if item.Deleted {
		if len(item.Data) != 0 {
			return false
		}
		_, err := time.Parse(time.RFC3339Nano, item.DeletedAt)
		return err == nil
	}
	return item.DeletedAt == "" && len(item.Data) > 0 && json.Valid(item.Data)
}

func knownItemKind(kind string) bool {
	switch kind {
	case "group", "host", "credential", "knownHost", "forward", "settings", "profile", "scheme", "prefs":
		return true
	default:
		return false
	}
}

func compareVectors(left, right VersionVector) vectorRelation {
	leftAtLeast, rightAtLeast := true, true
	strictLeft, strictRight := false, false
	devices := make(map[string]struct{}, len(left)+len(right))
	for device := range left {
		devices[device] = struct{}{}
	}
	for device := range right {
		devices[device] = struct{}{}
	}
	for device := range devices {
		l, r := left[device], right[device]
		if l < r {
			leftAtLeast, strictRight = false, true
		}
		if r < l {
			rightAtLeast, strictLeft = false, true
		}
	}
	switch {
	case leftAtLeast && rightAtLeast:
		return vectorsEqual
	case leftAtLeast && strictLeft:
		return leftDominates
	case rightAtLeast && strictRight:
		return rightDominates
	default:
		return vectorsConcurrent
	}
}

func VectorDominatesOrEquals(left, right VersionVector) bool {
	for device, counter := range right {
		if left[device] < counter {
			return false
		}
	}
	return true
}

func joinVectors(left, right VersionVector) VersionVector {
	joined := make(VersionVector, len(left)+len(right))
	for device, counter := range left {
		joined[device] = counter
	}
	for device, counter := range right {
		if counter > joined[device] {
			joined[device] = counter
		}
	}
	return joined
}

func versionHash(item ItemVersion) string {
	if item.Deleted {
		return StableItemHash([]byte("deleted"))
	}
	return StableItemHash(item.Data)
}

func cloneVersion(item ItemVersion) ItemVersion {
	item.VV = joinVectors(item.VV, nil)
	item.Data = append(json.RawMessage(nil), item.Data...)
	return item
}

func newConflict(local, remote ItemVersion, now time.Time) Conflict {
	return Conflict{Key: local.Key, Local: cloneVersion(local), Remote: cloneVersion(remote), DetectedAt: now.UTC().Format(time.RFC3339Nano)}
}

func repairDependencies(items []ItemVersion, conflicts []Conflict) []ItemVersion {
	activeGroups, activeCredentials, activeHosts, activeProfiles := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	markActive := func(item ItemVersion) {
		if item.Deleted {
			return
		}
		kind, id, _ := strings.Cut(item.Key, ":")
		switch kind {
		case "group":
			activeGroups[id] = true
		case "credential":
			activeCredentials[id] = true
		case "host":
			activeHosts[id] = true
		case "profile":
			activeProfiles[id] = true
		}
	}
	for _, item := range items {
		markActive(item)
	}
	for _, conflict := range conflicts {
		markActive(conflict.Local)
		markActive(conflict.Remote)
	}

	result := make([]ItemVersion, 0, len(items))
	for _, item := range items {
		kind, _, _ := strings.Cut(item.Key, ":")
		if item.Deleted {
			result = append(result, item)
			continue
		}
		switch kind {
		case "group":
			var group model.Group
			if json.Unmarshal(item.Data, &group) == nil && group.ParentID != nil && !activeGroups[*group.ParentID] {
				group.ParentID = nil
				item.Data, _ = json.Marshal(group)
			}
		case "host":
			var host model.Host
			if json.Unmarshal(item.Data, &host) == nil {
				changed := false
				if host.GroupID != nil && !activeGroups[*host.GroupID] {
					host.GroupID, changed = nil, true
				}
				if host.CredentialID != nil && !activeCredentials[*host.CredentialID] {
					host.CredentialID, host.AuthMethod, changed = nil, model.AuthAsk, true
				}
				if host.ProfileID != nil && !activeProfiles[*host.ProfileID] {
					host.ProfileID, changed = nil, true
				}
				if changed {
					item.Data, _ = json.Marshal(host)
				}
			}
		case "forward":
			var rule model.ForwardRule
			if json.Unmarshal(item.Data, &rule) == nil && !activeHosts[rule.HostID] {
				continue
			}
		}
		result = append(result, item)
	}
	return result
}

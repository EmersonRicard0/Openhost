package importer

import (
	"strings"
	"sync"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/exporter"
	"shellvault/internal/model"
	"shellvault/internal/vault"
)

type replacedHost struct {
	Before         model.Host
	BeforeRules    []model.ForwardRule
	BeforeProfile  *model.TerminalProfile
	AfterProfileID *string
	UpdatedAt      string
}
type ImportBatch struct {
	ID                                                    string
	CreatedHostIDs, CreatedGroupIDs, CreatedCredentialIDs []string
	Replaced                                              []replacedHost
	CommittedAt                                           string
}
type ImportResult struct {
	BatchID     string `json:"batchId"`
	Created     int    `json:"created"`
	Replaced    int    `json:"replaced"`
	Skipped     int    `json:"skipped"`
	Ignored     int    `json:"ignored"`
	KeysStored  int    `json:"keysStored"`
	KeysReused  int    `json:"keysReused"`
	AskPassword int    `json:"askPassword"`
}
type UndoResult struct {
	Removed    int `json:"removed"`
	Restored   int `json:"restored"`
	KeptEdited int `json:"keptEdited"`
}

type Coordinator struct {
	mu         sync.Mutex
	store      *vault.Store
	preview    *ImportPreview
	batch      *ImportBatch
	commitHook func(*model.Content) error
}

func NewCoordinator(store *vault.Store) *Coordinator { return &Coordinator{store: store} }
func (c *Coordinator) SetPreview(p *ImportPreview) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.preview != nil && c.preview != p {
		c.preview.Zero()
	}
	c.preview = p
	c.batch = nil
}
func (c *Coordinator) Preview(id string) (*ImportPreview, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.preview == nil || c.preview.ID != id || time.Now().After(c.preview.expiresAt) {
		if c.preview != nil {
			c.preview.Zero()
			c.preview = nil
		}
		return nil, apperr.New(apperr.PreviewExpired)
	}
	c.preview.expiresAt = time.Now().Add(30 * time.Minute)
	return c.preview, nil
}
func (c *Coordinator) Discard(id string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.preview != nil && c.preview.ID == id {
		c.preview.Zero()
		c.preview = nil
	}
}
func (c *Coordinator) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.preview != nil {
		c.preview.Zero()
	}
	c.preview = nil
	c.batch = nil
}

func (c *Coordinator) Commit(previewID string, targetGroupID *string) (ImportResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	p := c.preview
	if p == nil || p.ID != previewID || time.Now().After(p.expiresAt) {
		return ImportResult{}, apperr.New(apperr.PreviewExpired)
	}
	now := domain.Now()
	result := ImportResult{BatchID: domain.NewID(), Ignored: len(p.Ignored)}
	batch := &ImportBatch{ID: result.BatchID, CommittedAt: now}
	profilesBefore := map[string]*model.TerminalProfile{}
	for _, row := range p.Rows {
		_, importsProfile := row.Extra["profile"]
		if importsProfile && row.Selected && row.State == StateDuplicate && row.DuplicateAction == DuplicateReplace && row.DuplicateOf != nil && row.DuplicateOf.HostID != nil {
			profile, err := c.store.HostProfile(*row.DuplicateOf.HostID)
			if err != nil {
				return ImportResult{}, err
			}
			profilesBefore[*row.DuplicateOf.HostID] = profile
		}
	}
	err := c.store.MutateWithProfiles(func(content *model.Content) (vault.ProfileChanges, error) {
		profileChanges := vault.ProfileChanges{}
		if targetGroupID != nil && !groupExists(content, *targetGroupID) {
			return profileChanges, apperr.New(apperr.InvalidInput)
		}
		keyIDs := map[string]string{}
		usedRefs := map[string]bool{}
		for _, row := range p.Rows {
			if row.Selected && row.State != StateInvalid && !(row.State == StateDuplicate && row.DuplicateAction == DuplicateSkip) && row.KeyRef != nil {
				usedRefs[*row.KeyRef] = true
			}
		}
		for _, key := range p.Keys {
			if !usedRefs[key.Ref] {
				continue
			}
			secret := p.keyData[key.Ref]
			switch key.Status {
			case KeyExisting:
				if secret != nil {
					keyIDs[key.Ref] = secret.credentialID
					result.KeysReused++
				}
			case KeyReady:
				if secret == nil {
					continue
				}
				name := uniqueCredentialName(content, key.Name)
				var phrase *string
				if len(secret.passphrase) > 0 {
					s := string(secret.passphrase)
					phrase = &s
				}
				credential, err := domain.ImportKey(content, name, string(secret.privateKey), phrase, now)
				if err != nil {
					return profileChanges, err
				}
				keyIDs[key.Ref] = credential.ID
				batch.CreatedCredentialIDs = append(batch.CreatedCredentialIDs, credential.ID)
				result.KeysStored++
			}
		}
		paths := map[string]*string{}
		if p.Kind == SourceOpenHost {
			for _, group := range p.Groups {
				if _, err := ensureGroupPath(content, targetGroupID, group.Path, paths, batch, p.groupSortOrders); err != nil {
					return profileChanges, err
				}
			}
		}
		for _, row := range p.Rows {
			if !row.Selected || row.State == StateInvalid || (row.State == StateDuplicate && row.DuplicateAction == DuplicateSkip) {
				result.Skipped++
				continue
			}
			groupID, err := ensureGroupPath(content, targetGroupID, row.GroupPath, paths, batch, p.groupSortOrders)
			if err != nil {
				return profileChanges, err
			}
			credentialID := (*string)(nil)
			if row.KeyRef != nil {
				if id := keyIDs[*row.KeyRef]; id != "" {
					credentialID = model.Ptr(id)
				}
			}
			if row.State == StateDuplicate && row.DuplicateAction == DuplicateReplace && row.DuplicateOf != nil && row.DuplicateOf.HostID != nil {
				for i := range content.Hosts {
					if content.Hosts[i].ID == *row.DuplicateOf.HostID {
						before := content.Hosts[i]
						beforeRules := domain.ListForwardRulesForHost(content, before.ID)
						updated := before
						updated.Label = row.Label
						updated.Address = row.Address
						updated.Port = row.Port
						updated.Username = row.Username
						updated.GroupID = groupID
						_, importsAuth := row.Extra["authMethod"]
						if credentialID != nil || importsAuth {
							updated.CredentialID = credentialID
						}
						applyOpenHostFields(content, &updated, row, credentialID != nil)
						if updated.CredentialID == nil {
							result.AskPassword++
						}
						if err := collectProfileChange(&updated, row, &profileChanges); err != nil {
							return profileChanges, err
						}
						updated.UpdatedAt = now
						content.Hosts[i] = updated
						if err := replaceForwardRules(content, updated.ID, row); err != nil {
							return profileChanges, err
						}
						batch.Replaced = append(batch.Replaced, replacedHost{Before: before, BeforeRules: beforeRules, BeforeProfile: profilesBefore[before.ID], AfterProfileID: cloneString(updated.ProfileID), UpdatedAt: updated.UpdatedAt})
						result.Replaced++
						break
					}
				}
				continue
			}
			label := row.Label
			if row.State == StateDuplicate && row.DuplicateAction == DuplicateKeepBoth {
				label = importedLabel(label)
			}
			auth := model.AuthPassword
			if credentialID != nil {
				auth = model.AuthKey
			} else {
				result.AskPassword++
			}
			host := model.Host{ID: domain.NewID(), Label: label, Address: domain.NormalizeAddress(row.Address), Port: row.Port, Username: row.Username, AuthMethod: auth, CredentialID: credentialID, GroupID: groupID, OSIcon: model.OSIconAuto, CreatedAt: now, UpdatedAt: now}
			applyOpenHostFields(content, &host, row, credentialID != nil)
			if err := collectProfileChange(&host, row, &profileChanges); err != nil {
				return profileChanges, err
			}
			content.Hosts = append(content.Hosts, host)
			if err := replaceForwardRules(content, host.ID, row); err != nil {
				return profileChanges, err
			}
			batch.CreatedHostIDs = append(batch.CreatedHostIDs, host.ID)
			result.Created++
		}
		if c.commitHook != nil {
			if err := c.commitHook(content); err != nil {
				return profileChanges, err
			}
		}
		return profileChanges, nil
	})
	if err != nil {
		return ImportResult{}, err
	}
	p.Zero()
	c.preview = nil
	c.batch = batch
	return result, nil
}

func applyOpenHostFields(content *model.Content, host *model.Host, row PreviewRow, hasKey bool) {
	if row.Extra == nil {
		return
	}
	if value, ok := row.Extra["legacyAlgorithms"].(bool); ok {
		host.LegacyAlgorithms = value
	}
	if value, ok := row.Extra["osIcon"].(string); ok && domain.ValidOSIcon(value) {
		host.OSIcon = value
	}
	if tags, ok := row.Extra["tags"].([]string); ok {
		host.Tags = append([]string{}, tags...)
	}
	if notes, ok := row.Extra["notes"].(string); ok {
		host.Notes = notes
	}
	if favorite, ok := row.Extra["favorite"].(bool); ok {
		host.Favorite = favorite
	}
	if value, present := row.Extra["environment"]; present {
		host.EnvironmentID = nil
		if environment, ok := value.(*model.Environment); ok && environment != nil {
			for _, existing := range content.Settings.Environments {
				if strings.EqualFold(existing.Name, environment.Name) {
					host.EnvironmentID = model.Ptr(existing.ID)
					break
				}
			}
			if host.EnvironmentID == nil && len(content.Settings.Environments) < 12 {
				created := *environment
				if created.ID == "" {
					created.ID = domain.NewID()
				}
				content.Settings.Environments = append(content.Settings.Environments, created)
				host.EnvironmentID = model.Ptr(created.ID)
			}
		}
	}
	if hasKey {
		host.AuthMethod = model.AuthKey
		return
	}
	if value, ok := row.Extra["authMethod"].(string); ok {
		switch model.AuthMethod(value) {
		case model.AuthAsk, model.AuthAgent, model.AuthPassword:
			host.AuthMethod = model.AuthMethod(value)
		default:
			host.AuthMethod = model.AuthPassword
		}
	}
}

func collectProfileChange(host *model.Host, row PreviewRow, changes *vault.ProfileChanges) error {
	if row.Extra == nil {
		return nil
	}
	value, present := row.Extra["profile"]
	if !present {
		return nil
	}
	if value == nil {
		if host.ProfileID != nil {
			changes.Delete = append(changes.Delete, *host.ProfileID)
		}
		host.ProfileID = nil
		return nil
	}
	profile, ok := value.(model.TerminalProfile)
	if !ok {
		return apperr.New(apperr.ImportUnreadable)
	}
	if host.ProfileID != nil {
		profile.ID = *host.ProfileID
	} else {
		if profile.ID == "" {
			profile.ID = domain.NewID()
		}
	}
	profile.IsGlobal = false
	host.ProfileID = model.Ptr(profile.ID)
	changes.Save = append(changes.Save, profile)
	return nil
}

func replaceForwardRules(content *model.Content, hostID string, row PreviewRow) error {
	if row.Extra == nil {
		return nil
	}
	value, present := row.Extra["forwardRules"]
	if !present {
		return nil
	}
	rules, ok := value.([]exporter.OpenHostForwardRule)
	if !ok {
		return apperr.New(apperr.ImportUnreadable)
	}
	kept := content.ForwardRules[:0]
	for _, rule := range content.ForwardRules {
		if rule.HostID != hostID {
			kept = append(kept, rule)
		}
	}
	content.ForwardRules = kept
	for _, rule := range rules {
		_, err := domain.CreateForwardRule(content, domain.ForwardRuleInput{HostID: hostID, Label: rule.Label,
			BindAddress: rule.BindAddress, AllowNonLoopback: rule.AllowNonLoopback, BindPort: rule.BindPort,
			DestHost: rule.DestHost, DestPort: rule.DestPort})
		if err != nil {
			return err
		}
	}
	return nil
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func groupExists(content *model.Content, id string) bool {
	for _, g := range content.Groups {
		if g.ID == id {
			return true
		}
	}
	return false
}
func ensureGroupPath(content *model.Content, root *string, path []string, cache map[string]*string, batch *ImportBatch, sortOrders map[string]int) (*string, error) {
	parent := root
	parts := []string{}
	sourceParts := []string{}
	if root != nil {
		parts = append(parts, *root)
	}
	for _, raw := range path {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		parts = append(parts, name)
		sourceParts = append(sourceParts, name)
		key := strings.Join(parts, "\x00")
		if id, ok := cache[key]; ok {
			parent = id
			continue
		}
		var found *string
		for _, g := range content.Groups {
			if strings.EqualFold(g.Name, name) && samePtr(g.ParentID, parent) {
				id := g.ID
				found = &id
				break
			}
		}
		if found == nil {
			g, err := domain.CreateGroup(content, name, parent)
			if err != nil {
				return nil, err
			}
			if order, ok := sortOrders[strings.Join(sourceParts, "\x00")]; ok {
				for i := range content.Groups {
					if content.Groups[i].ID == g.ID {
						content.Groups[i].SortOrder = order
						break
					}
				}
			}
			batch.CreatedGroupIDs = append(batch.CreatedGroupIDs, g.ID)
			found = model.Ptr(g.ID)
		}
		cache[key] = found
		parent = found
	}
	return parent, nil
}
func samePtr(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
func uniqueCredentialName(content *model.Content, name string) string {
	if name == "" {
		name = "Chave importada"
	}
	base := name
	used := map[string]bool{}
	for _, cr := range content.Credentials {
		used[strings.ToLower(cr.Name)] = true
	}
	if !used[strings.ToLower(name)] {
		return name
	}
	for n := 2; ; n++ {
		suffix := " (" + itoa(n) + ")"
		r := []rune(base)
		if len(r) > 100-len([]rune(suffix)) {
			r = r[:100-len([]rune(suffix))]
		}
		candidate := string(r) + suffix
		if !used[strings.ToLower(candidate)] {
			return candidate
		}
	}
}
func importedLabel(label string) string {
	const suffix = " (importado)"
	r := []rune(label)
	if len(r) > 100-len([]rune(suffix)) {
		r = r[:100-len([]rune(suffix))]
	}
	return string(r) + suffix
}

func (c *Coordinator) Undo(batchID string) (UndoResult, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.batch == nil || c.batch.ID != batchID {
		return UndoResult{}, apperr.New(apperr.UndoUnavailable)
	}
	batch := c.batch
	result := UndoResult{}
	err := c.store.MutateWithProfiles(func(content *model.Content) (vault.ProfileChanges, error) {
		profileChanges := vault.ProfileChanges{}
		created := set(batch.CreatedHostIDs)
		removedHosts := map[string]bool{}
		hosts := content.Hosts[:0]
		for _, h := range content.Hosts {
			if created[h.ID] {
				if h.UpdatedAt == batch.CommittedAt {
					removedHosts[h.ID] = true
					if h.ProfileID != nil {
						profileChanges.Delete = append(profileChanges.Delete, *h.ProfileID)
					}
					result.Removed++
					continue
				}
				result.KeptEdited++
			}
			hosts = append(hosts, h)
		}
		content.Hosts = hosts
		keptRules := content.ForwardRules[:0]
		for _, rule := range content.ForwardRules {
			if !removedHosts[rule.HostID] {
				keptRules = append(keptRules, rule)
			}
		}
		content.ForwardRules = keptRules
		for _, rep := range batch.Replaced {
			for i := range content.Hosts {
				if content.Hosts[i].ID == rep.Before.ID {
					if content.Hosts[i].UpdatedAt == rep.UpdatedAt {
						kept := content.ForwardRules[:0]
						for _, rule := range content.ForwardRules {
							if rule.HostID != rep.Before.ID {
								kept = append(kept, rule)
							}
						}
						content.ForwardRules = append(kept, rep.BeforeRules...)
						if rep.AfterProfileID != nil && (rep.Before.ProfileID == nil || *rep.AfterProfileID != *rep.Before.ProfileID) {
							profileChanges.Delete = append(profileChanges.Delete, *rep.AfterProfileID)
						}
						if rep.BeforeProfile != nil {
							profileChanges.Save = append(profileChanges.Save, *rep.BeforeProfile)
						}
						content.Hosts[i] = rep.Before
						result.Restored++
					} else {
						result.KeptEdited++
					}
					break
				}
			}
		}
		usedCred := map[string]bool{}
		for _, h := range content.Hosts {
			if h.CredentialID != nil {
				usedCred[*h.CredentialID] = true
			}
		}
		createdCred := set(batch.CreatedCredentialIDs)
		creds := content.Credentials[:0]
		for _, cr := range content.Credentials {
			if createdCred[cr.ID] && !usedCred[cr.ID] {
				continue
			}
			creds = append(creds, cr)
		}
		content.Credentials = creds
		createdGroup := set(batch.CreatedGroupIDs)
		changed := true
		for changed {
			changed = false
			used := map[string]bool{}
			for _, h := range content.Hosts {
				if h.GroupID != nil {
					used[*h.GroupID] = true
				}
			}
			for _, g := range content.Groups {
				if g.ParentID != nil {
					used[*g.ParentID] = true
				}
			}
			groups := content.Groups[:0]
			for _, g := range content.Groups {
				if createdGroup[g.ID] && !used[g.ID] {
					changed = true
					continue
				}
				groups = append(groups, g)
			}
			content.Groups = groups
		}
		return profileChanges, nil
	})
	if err != nil {
		return UndoResult{}, err
	}
	c.batch = nil
	return result, nil
}
func set(ids []string) map[string]bool {
	m := map[string]bool{}
	for _, id := range ids {
		m[id] = true
	}
	return m
}

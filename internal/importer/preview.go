package importer

import (
	"strings"
	"time"
	"unicode/utf8"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
)

const MaxRows = 5000

type SourceKind string

const (
	SourceOpenSSH       SourceKind = "openssh"
	SourcePuTTY         SourceKind = "putty"
	SourceKiTTY         SourceKind = "kitty"
	SourceKiTTYPortable SourceKind = "kittyPortable"
	SourceCSV           SourceKind = "csv"
	SourceMobaXterm     SourceKind = "mobaxterm"
	SourceSecureCRT     SourceKind = "securecrt"
	SourceOpenHost      SourceKind = "openhost"
)

type RowState string

const (
	StateOK        RowState = "ok"
	StateInvalid   RowState = "invalid"
	StateDuplicate RowState = "duplicate"
)

type DuplicateAction string

const (
	DuplicateSkip     DuplicateAction = "skip"
	DuplicateReplace  DuplicateAction = "replace"
	DuplicateKeepBoth DuplicateAction = "keepBoth"
)

const (
	WarningInvalidPort      = "INVALID_PORT"
	WarningMissingAddress   = "MISSING_ADDRESS"
	WarningKeyNotFound      = "KEY_NOT_FOUND"
	WarningKeyUnsupported   = "KEY_UNSUPPORTED"
	WarningOptionIgnored    = "OPTION_IGNORED"
	WarningLabelRepeated    = "LABEL_REPEATED"
	WarningTokenUnsupported = "TOKEN_UNSUPPORTED"
	WarningLineUnreadable   = "LINE_UNREADABLE"
)

type Warning struct {
	Code string  `json:"code"`
	Name *string `json:"name,omitempty"`
	Line *int    `json:"line,omitempty"`
}
type IgnoredItem struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}
type PreviewGroup struct {
	Path []string `json:"path"`
	Name string   `json:"name"`
}
type DuplicateOf struct {
	HostID *string `json:"hostId,omitempty"`
	RowID  *string `json:"rowId,omitempty"`
}

type PreviewRow struct {
	RowID           string          `json:"rowId"`
	Label           string          `json:"label"`
	Address         string          `json:"address"`
	Port            int             `json:"port"`
	Username        string          `json:"username"`
	GroupPath       []string        `json:"groupPath"`
	KeyRef          *string         `json:"keyRef"`
	Origin          string          `json:"origin"`
	Warnings        []Warning       `json:"warnings"`
	State           RowState        `json:"state"`
	DuplicateOf     *DuplicateOf    `json:"duplicateOf"`
	Selected        bool            `json:"selected"`
	DuplicateAction DuplicateAction `json:"duplicateAction"`
	Extra           map[string]any  `json:"extra,omitempty"`
}

type KeyStatus string

const (
	KeyReady           KeyStatus = "ready"
	KeyNeedsPassphrase KeyStatus = "needsPassphrase"
	KeySkipped         KeyStatus = "skipped"
	KeyNotFound        KeyStatus = "notFound"
	KeyUnsupported     KeyStatus = "unsupported"
	KeyExisting        KeyStatus = "existing"
)

type PreviewKey struct {
	Ref         string    `json:"ref"`
	Name        string    `json:"name"`
	Path        string    `json:"path"`
	Status      KeyStatus `json:"status"`
	Fingerprint *string   `json:"fingerprint"`
	UsedBy      int       `json:"usedBy"`
}
type CsvPreview struct {
	Columns      []string        `json:"columns"`
	Mapping      map[string]*int `json:"mapping"`
	NeedsMapping bool            `json:"needsMapping"`
}

type PreviewView struct {
	ID           string         `json:"id"`
	Kind         SourceKind     `json:"kind"`
	SourceLabel  string         `json:"sourceLabel"`
	Rows         []PreviewRow   `json:"rows"`
	Groups       []PreviewGroup `json:"groups,omitempty"`
	Keys         []PreviewKey   `json:"keys"`
	Ignored      []IgnoredItem  `json:"ignored"`
	FileWarnings []Warning      `json:"fileWarnings"`
	CSV          *CsvPreview    `json:"csv"`
}

type CandidateRow struct {
	Label, Address string
	Port           int
	Username       string
	GroupPath      []string
	KeyPath        string
	Origin         string
	Warnings       []Warning
	Extra          map[string]any
}
type RowPatch struct {
	Label           *string          `json:"label"`
	Address         *string          `json:"address"`
	Port            *int             `json:"port"`
	Username        *string          `json:"username"`
	Selected        *bool            `json:"selected"`
	DuplicateAction *DuplicateAction `json:"duplicateAction"`
}

type keySecret struct {
	privateKey, passphrase []byte
	credentialID           string
}

type ImportPreview struct {
	ID                      string
	Kind                    SourceKind
	SourceLabel             string
	Rows                    []PreviewRow
	Groups                  []PreviewGroup
	Keys                    []PreviewKey
	Ignored                 []IgnoredItem
	FileWarnings            []Warning
	CSV                     *CsvPreview
	keyData                 map[string]*keySecret
	credentialByFingerprint map[string]string
	groupSortOrders         map[string]int
	expiresAt               time.Time
}

func Build(kind SourceKind, sourceLabel string, rows []CandidateRow, content *model.Content) (*ImportPreview, error) {
	if len(rows) > MaxRows {
		return nil, apperr.New(apperr.ImportTooLarge)
	}
	p := &ImportPreview{ID: domain.NewID(), Kind: kind, SourceLabel: sourceLabel, keyData: map[string]*keySecret{}, credentialByFingerprint: map[string]string{}, expiresAt: time.Now().Add(30 * time.Minute)}
	keyRefs := map[string]string{}
	groups := map[string]bool{}
	for _, candidate := range rows {
		row := PreviewRow{RowID: domain.NewID(), Label: strings.TrimSpace(candidate.Label), Address: domain.NormalizeAddress(candidate.Address), Port: candidate.Port, Username: strings.TrimSpace(candidate.Username), GroupPath: append([]string{}, candidate.GroupPath...), Origin: candidate.Origin, Warnings: append([]Warning{}, candidate.Warnings...), DuplicateAction: DuplicateSkip, Extra: candidate.Extra}
		if row.Port == 0 {
			row.Port = 22
		}
		if row.Label == "" {
			row.Label = row.Address
		}
		if candidate.KeyPath != "" {
			path := candidate.KeyPath
			ref, ok := keyRefs[path]
			if !ok {
				ref = domain.NewID()
				keyRefs[path] = ref
				p.Keys = append(p.Keys, PreviewKey{Ref: ref, Name: baseName(path), Path: path, Status: KeyUnsupported})
			}
			row.KeyRef = &ref
			for i := range p.Keys {
				if p.Keys[i].Ref == ref {
					p.Keys[i].UsedBy++
				}
			}
		}
		p.Rows = append(p.Rows, row)
		for i, name := range row.GroupPath {
			path := append([]string{}, row.GroupPath[:i+1]...)
			key := strings.Join(path, "\x00")
			if !groups[key] {
				groups[key] = true
				p.Groups = append(p.Groups, PreviewGroup{Path: path, Name: name})
			}
		}
	}
	p.revalidate(content)
	for i := range p.Rows {
		p.Rows[i].Selected = p.Rows[i].State == StateOK
	}
	return p, nil
}

func baseName(path string) string {
	path = strings.ReplaceAll(path, "\\", "/")
	if i := strings.LastIndex(path, "/"); i >= 0 {
		return path[i+1:]
	}
	return path
}
func endpointKey(r PreviewRow) string {
	return strings.ToLower(domain.NormalizeAddress(r.Address)) + "|" + itoa(r.Port) + "|" + r.Username
}
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func (p *ImportPreview) revalidate(content *model.Content) {
	existing := map[string]string{}
	for _, h := range content.Hosts {
		existing[strings.ToLower(domain.NormalizeAddress(h.Address))+"|"+itoa(h.Port)+"|"+h.Username] = h.ID
	}
	seen, labels := map[string]string{}, map[string][]int{}
	for i := range p.Rows {
		r := &p.Rows[i]
		r.Address = domain.NormalizeAddress(r.Address)
		r.Warnings = keepParserWarnings(r.Warnings)
		r.State = StateOK
		r.DuplicateOf = nil
		if r.Port == 0 {
			r.Port = 22
		}
		if r.Label == "" {
			r.Label = r.Address
		}
		if strings.TrimSpace(r.Address) == "" {
			r.Warnings = append(r.Warnings, Warning{Code: WarningMissingAddress})
			r.State = StateInvalid
		}
		if r.Port < 1 || r.Port > 65535 {
			r.Warnings = append(r.Warnings, Warning{Code: WarningInvalidPort})
			r.State = StateInvalid
		}
		if utf8.RuneCountInString(r.Label) < 1 || utf8.RuneCountInString(r.Label) > 100 {
			r.State = StateInvalid
		}
		if r.State != StateInvalid {
			key := endpointKey(*r)
			if id, ok := existing[key]; ok {
				r.State = StateDuplicate
				r.DuplicateOf = &DuplicateOf{HostID: &id}
			} else if id, ok := seen[key]; ok {
				r.State = StateDuplicate
				r.DuplicateOf = &DuplicateOf{RowID: &id}
			} else {
				seen[key] = r.RowID
			}
		}
		labels[strings.ToLower(r.Label)] = append(labels[strings.ToLower(r.Label)], i)
	}
	for _, indexes := range labels {
		if len(indexes) > 1 {
			addresses := map[string]bool{}
			for _, i := range indexes {
				addresses[strings.ToLower(p.Rows[i].Address)] = true
			}
			if len(addresses) > 1 {
				for _, i := range indexes {
					p.Rows[i].Warnings = append(p.Rows[i].Warnings, Warning{Code: WarningLabelRepeated})
				}
			}
		}
	}
	for i := range p.Rows {
		r := &p.Rows[i]
		if r.State == StateInvalid || (r.State == StateDuplicate && r.DuplicateAction == DuplicateSkip) {
			r.Selected = false
		}
	}
}

func keepParserWarnings(in []Warning) []Warning {
	out := in[:0]
	for _, w := range in {
		if w.Code != WarningMissingAddress && w.Code != WarningInvalidPort && w.Code != WarningLabelRepeated {
			out = append(out, w)
		}
	}
	return out
}
func (p *ImportPreview) View() PreviewView {
	p.expiresAt = time.Now().Add(30 * time.Minute)
	return PreviewView{ID: p.ID, Kind: p.Kind, SourceLabel: p.SourceLabel, Rows: cloneRows(p.Rows), Groups: append([]PreviewGroup{}, p.Groups...), Keys: append([]PreviewKey{}, p.Keys...), Ignored: append([]IgnoredItem{}, p.Ignored...), FileWarnings: append([]Warning{}, p.FileWarnings...), CSV: p.CSV}
}
func cloneRows(rows []PreviewRow) []PreviewRow {
	out := make([]PreviewRow, len(rows))
	for i, r := range rows {
		out[i] = r
		out[i].GroupPath = append([]string{}, r.GroupPath...)
		out[i].Warnings = append([]Warning{}, r.Warnings...)
	}
	return out
}

func (p *ImportPreview) UpdateRow(id string, patch RowPatch, content *model.Content) error {
	var row *PreviewRow
	for i := range p.Rows {
		if p.Rows[i].RowID == id {
			row = &p.Rows[i]
			break
		}
	}
	if row == nil {
		return apperr.New(apperr.NotFound)
	}
	if patch.Label != nil {
		row.Label = *patch.Label
	}
	if patch.Address != nil {
		row.Address = *patch.Address
	}
	if patch.Port != nil {
		row.Port = *patch.Port
	}
	if patch.Username != nil {
		row.Username = *patch.Username
	}
	if patch.DuplicateAction != nil {
		row.DuplicateAction = *patch.DuplicateAction
	}
	p.revalidate(content)
	if patch.Selected != nil {
		if *patch.Selected && row.State == StateInvalid {
			return apperr.New(apperr.InvalidInput)
		}
		row.Selected = *patch.Selected
	}
	return nil
}
func (p *ImportPreview) SelectAll(selected bool, groupPath *[]string) {
	for i := range p.Rows {
		r := &p.Rows[i]
		if groupPath != nil && !samePath(r.GroupPath, *groupPath) {
			continue
		}
		if r.State != StateInvalid {
			r.Selected = selected && !(r.State == StateDuplicate && r.DuplicateAction == DuplicateSkip)
		}
	}
}
func samePath(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
func (p *ImportPreview) SetDuplicateAction(action DuplicateAction) error {
	if action != DuplicateSkip && action != DuplicateReplace && action != DuplicateKeepBoth {
		return apperr.New(apperr.InvalidInput)
	}
	for i := range p.Rows {
		if p.Rows[i].State == StateDuplicate {
			if action == DuplicateReplace && (p.Rows[i].DuplicateOf == nil || p.Rows[i].DuplicateOf.HostID == nil) {
				continue
			}
			p.Rows[i].DuplicateAction = action
			p.Rows[i].Selected = action != DuplicateSkip
		}
	}
	return nil
}
func (p *ImportPreview) Zero() {
	for _, d := range p.keyData {
		zero(d.privateKey)
		zero(d.passphrase)
	}
	p.keyData = map[string]*keySecret{}
}
func zero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

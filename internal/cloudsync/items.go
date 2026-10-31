package cloudsync

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"math"
	"net"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/validate"
)

type SyncPreferences struct {
	Shortcuts       map[string]string `json:"shortcuts"`
	CopyOnSelect    bool              `json:"copyOnSelect"`
	RightClickPaste bool              `json:"rightClickPaste"`
	Bell            string            `json:"bell"`
	BoldBright      bool              `json:"boldBright"`
	AutoReconnect   bool              `json:"autoReconnect"`
}

type SyncData struct {
	Content     *model.Content
	Profiles    []model.TerminalProfile
	Schemes     []model.ColorScheme
	Preferences SyncPreferences
}

type PlainItem struct {
	Key  string          `json:"key"`
	Hash string          `json:"hash"`
	Data json.RawMessage `json:"data"`
}

func SyncPreferencesFrom(preferences appwin.Preferences) SyncPreferences {
	shortcuts := make(map[string]string, len(preferences.Shortcuts))
	for action, shortcut := range preferences.Shortcuts {
		shortcuts[action] = shortcut
	}
	return SyncPreferences{Shortcuts: shortcuts, CopyOnSelect: preferences.CopyOnSelect,
		RightClickPaste: preferences.RightClickPaste, Bell: preferences.Bell,
		BoldBright: preferences.BoldBright, AutoReconnect: preferences.AutoReconnect}
}

func ApplySyncPreferences(base appwin.Preferences, synced SyncPreferences) appwin.Preferences {
	base.Shortcuts = make(map[string]string, len(synced.Shortcuts))
	for action, shortcut := range synced.Shortcuts {
		base.Shortcuts[action] = shortcut
	}
	base.CopyOnSelect, base.RightClickPaste = synced.CopyOnSelect, synced.RightClickPaste
	base.Bell, base.BoldBright, base.AutoReconnect = synced.Bell, synced.BoldBright, synced.AutoReconnect
	return base
}

func StableItemHash(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func EncodeItems(data SyncData) ([]PlainItem, error) {
	if data.Content == nil {
		return nil, apperr.New(apperr.InvalidInput)
	}
	items := make([]PlainItem, 0, len(data.Content.Groups)+len(data.Content.Hosts)+len(data.Content.Credentials)+len(data.Content.KnownHosts)+len(data.Content.ForwardRules)+len(data.Profiles)+len(data.Schemes)+2)
	add := func(key string, value any) error {
		raw, err := json.Marshal(value)
		if err != nil {
			return err
		}
		items = append(items, PlainItem{Key: key, Hash: StableItemHash(raw), Data: raw})
		return nil
	}
	for _, item := range data.Content.Groups {
		if err := add("group:"+item.ID, item); err != nil {
			return nil, err
		}
	}
	for _, item := range data.Content.Hosts {
		if err := add("host:"+item.ID, item); err != nil {
			return nil, err
		}
	}
	for _, item := range data.Content.Credentials {
		if err := add("credential:"+item.ID, item); err != nil {
			return nil, err
		}
	}
	for _, item := range data.Content.KnownHosts {
		if err := add("knownHost:"+item.ID, item); err != nil {
			return nil, err
		}
	}
	for _, item := range data.Content.ForwardRules {
		if err := add("forward:"+item.ID, item); err != nil {
			return nil, err
		}
	}
	if err := add("settings:1", data.Content.Settings); err != nil {
		return nil, err
	}
	for _, item := range data.Profiles {
		if err := add("profile:"+item.ID, item); err != nil {
			return nil, err
		}
	}
	for _, item := range data.Schemes {
		if err := add("scheme:"+item.ID, item); err != nil {
			return nil, err
		}
	}
	if err := add("prefs:1", data.Preferences); err != nil {
		return nil, err
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Key < items[j].Key })
	decoded, rejected, err := DecodeItems(items)
	if err != nil || len(rejected) != 0 || decoded.Content == nil {
		return nil, apperr.New(apperr.InvalidInput)
	}
	return items, nil
}

func DecodeItems(items []PlainItem) (SyncData, []string, error) {
	result := SyncData{Content: model.EmptyContent(), Profiles: []model.TerminalProfile{}, Schemes: []model.ColorScheme{}, Preferences: SyncPreferences{Shortcuts: map[string]string{}, Bell: "visual"}}
	seen := make(map[string]struct{}, len(items))
	rejected := make([]string, 0)
	for _, item := range items {
		if _, duplicate := seen[item.Key]; duplicate || len(item.Data) == 0 || !json.Valid(item.Data) || len(item.Hash) != sha256.Size*2 || subtle.ConstantTimeCompare([]byte(strings.ToLower(item.Hash)), []byte(StableItemHash(item.Data))) != 1 {
			rejected = append(rejected, item.Key)
			continue
		}
		seen[item.Key] = struct{}{}
		kind, id, ok := strings.Cut(item.Key, ":")
		if !ok || id == "" || !decodeOneItem(&result, kind, id, item.Data) {
			rejected = append(rejected, item.Key)
		}
	}
	sort.Strings(rejected)
	return result, rejected, nil
}

func decodeOneItem(result *SyncData, kind, id string, raw []byte) bool {
	switch kind {
	case "group":
		var item model.Group
		if decodeStrict(raw, &item) != nil || item.ID != id || !validGroup(item) {
			return false
		}
		result.Content.Groups = append(result.Content.Groups, item)
	case "host":
		var item model.Host
		if decodeStrict(raw, &item) != nil || item.ID != id || !validHost(item) {
			return false
		}
		result.Content.Hosts = append(result.Content.Hosts, item)
	case "credential":
		var item model.Credential
		if decodeStrict(raw, &item) != nil || item.ID != id || !validCredential(item) {
			return false
		}
		result.Content.Credentials = append(result.Content.Credentials, item)
	case "knownHost":
		var item model.KnownHost
		if decodeStrict(raw, &item) != nil || item.ID != id || !validKnownHost(item) {
			return false
		}
		result.Content.KnownHosts = append(result.Content.KnownHosts, item)
	case "forward":
		var item model.ForwardRule
		if decodeStrict(raw, &item) != nil || item.ID != id || !validForward(item) {
			return false
		}
		result.Content.ForwardRules = append(result.Content.ForwardRules, item)
	case "settings":
		var item model.VaultSettings
		if id != "1" || decodeStrict(raw, &item) != nil || !validSettings(item) {
			return false
		}
		result.Content.Settings = item
	case "profile":
		var item model.TerminalProfile
		if decodeStrict(raw, &item) != nil || item.ID != id || !validProfile(item) {
			return false
		}
		result.Profiles = append(result.Profiles, item)
	case "scheme":
		var item model.ColorScheme
		if decodeStrict(raw, &item) != nil || item.ID != id || !validScheme(item) {
			return false
		}
		result.Schemes = append(result.Schemes, item)
	case "prefs":
		var item SyncPreferences
		if id != "1" || decodeStrict(raw, &item) != nil || !validSyncPreferences(item) {
			return false
		}
		result.Preferences = item
	default:
		return false
	}
	return true
}

func validGroup(item model.Group) bool {
	_, textErr := validate.Text(item.Name, 1, 100)
	return validate.UUID(item.ID) == nil && validate.OptionalUUID(item.ParentID) == nil && textErr == nil && item.SortOrder >= 0
}

func validHost(item model.Host) bool {
	_, labelErr := validate.Text(item.Label, 1, 100)
	return validate.UUID(item.ID) == nil && labelErr == nil && domain.IsValidAddress(domain.NormalizeAddress(item.Address)) &&
		validate.Int(item.Port, 1, 65535) == nil && validUsername(item.Username) &&
		validate.OneOf(item.AuthMethod, model.AuthAsk, model.AuthAgent, model.AuthPassword, model.AuthKey) == nil &&
		validate.OptionalUUID(item.CredentialID) == nil && validate.OptionalUUID(item.GroupID) == nil && validate.OptionalUUID(item.ProfileID) == nil &&
		domain.ValidOSIcon(item.OSIcon) && validTime(item.CreatedAt) && validTime(item.UpdatedAt)
}

func validCredential(item model.Credential) bool {
	_, nameErr := validate.Text(item.Name, 1, 100)
	if validate.UUID(item.ID) != nil || nameErr != nil || !validTime(item.CreatedAt) {
		return false
	}
	switch item.Kind {
	case model.CredentialPassword:
		length := utf8.RuneCountInString(item.Password)
		return utf8.ValidString(item.Password) && length >= 1 && length <= 1024 && item.PrivateKey == ""
	case model.CredentialKey:
		if len(item.PrivateKey) == 0 || len(item.PrivateKey) > domain.MaxKeyBytes || item.Password != "" {
			return false
		}
		parsed, err := domain.ParsePrivateKey(item.PrivateKey, item.Passphrase)
		return err == nil && parsed.KeyType == item.KeyType && parsed.PublicKey == item.PublicKey && parsed.Fingerprint == item.Fingerprint
	default:
		return false
	}
}

func validKnownHost(item model.KnownHost) bool {
	_, endpointErr := validate.Text(item.Endpoint, 1, 512)
	_, typeErr := validate.Text(item.KeyType, 1, 128)
	_, fingerprintErr := validate.Text(item.Fingerprint, 1, 512)
	return validate.UUID(item.ID) == nil && endpointErr == nil && typeErr == nil && fingerprintErr == nil && validTime(item.AcceptedAt)
}

func validForward(item model.ForwardRule) bool {
	if validate.UUID(item.ID) != nil || validate.UUID(item.HostID) != nil || validate.Int(item.BindPort, 1, 65535) != nil || validate.Int(item.DestPort, 1, 65535) != nil {
		return false
	}
	if item.Label != nil {
		if _, err := validate.Text(*item.Label, 1, 100); err != nil {
			return false
		}
	}
	bind := domain.NormalizeAddress(item.BindAddress)
	return (strings.EqualFold(bind, "localhost") || net.ParseIP(bind) != nil) && (domain.IsLoopback(bind) || item.AllowNonLoopback) && domain.IsValidAddress(domain.NormalizeAddress(item.DestHost))
}

func validSettings(item model.VaultSettings) bool {
	return (item.AutoLockMinutes == nil || validate.Int(*item.AutoLockMinutes, 1, 120) == nil) &&
		validate.Int(item.ConnectTimeoutSeconds, 5, 120) == nil && validate.Int(item.KeepaliveSeconds, 10, 300) == nil && model.ValidTerm(item.Term)
}

var (
	colorRGBPattern  = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	colorRGBAPattern = regexp.MustCompile(`^#[0-9a-fA-F]{8}$`)
)

func validProfile(item model.TerminalProfile) bool {
	_, nameErr := validate.Text(item.Name, 1, 100)
	_, familyErr := validate.Text(item.FontFamily, 1, 100)
	return validate.UUID(item.ID) == nil && nameErr == nil && familyErr == nil && finite(item.FontSize, 8, 32) &&
		validate.Int(item.FontWeight, 100, 900) == nil && validate.Int(item.FontWeightBold, 100, 900) == nil && finite(item.LineHeight, 1, 2) &&
		finite(item.LetterSpacing, -2, 10) && validate.Int(item.Scrollback, 100, 100000) == nil && finite(item.BackgroundOpacity, .5, 1) &&
		validate.Int(item.Blur, 0, 40) == nil && validate.Int(item.Padding, 0, 32) == nil && validate.OneOf(item.CursorStyle, model.CursorBlock, model.CursorBar, model.CursorUnderline) == nil &&
		(item.CursorColor == nil || colorRGBPattern.MatchString(*item.CursorColor)) && validate.UUID(item.ColorSchemeID) == nil
}

func validScheme(item model.ColorScheme) bool {
	_, nameErr := validate.Text(item.Name, 1, 100)
	if validate.UUID(item.ID) != nil || nameErr != nil || validate.OneOf(item.Origin, model.SchemeBuiltin, model.SchemeImported, model.SchemeCustom) != nil ||
		!colorRGBPattern.MatchString(item.Foreground) || !colorRGBPattern.MatchString(item.Background) || !colorRGBPattern.MatchString(item.Cursor) ||
		(!colorRGBPattern.MatchString(item.Selection) && !colorRGBAPattern.MatchString(item.Selection)) || len(item.ANSI) != 16 {
		return false
	}
	for _, color := range item.ANSI {
		if !colorRGBPattern.MatchString(color) {
			return false
		}
	}
	return true
}

func validSyncPreferences(item SyncPreferences) bool {
	return item.Shortcuts != nil && appwin.ValidateShortcuts(item.Shortcuts) == nil && validate.OneOf(item.Bell, "off", "sound", "visual") == nil
}

func finite(value, minimum, maximum float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= minimum && value <= maximum
}

func validUsername(value string) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) < 1 || utf8.RuneCountInString(value) > 255 {
		return false
	}
	return strings.IndexFunc(value, func(r rune) bool { return r <= 0x20 || r == 0x7f }) < 0
}

func validTime(value string) bool {
	_, err := time.Parse(time.RFC3339Nano, value)
	return err == nil
}

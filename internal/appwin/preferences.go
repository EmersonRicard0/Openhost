package appwin

import (
	"regexp"
	"strings"
	"unicode/utf8"

	"shellvault/internal/vault"
	"shellvault/internal/vault/migrate001"
)

const preferencesKey = "preferences"

var accentID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,31}$`)

type WindowBounds struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	X         *int `json:"x"`
	Y         *int `json:"y"`
	Maximized bool `json:"maximized"`
}

type Preferences struct {
	Theme              string       `json:"theme"`
	TerminalFontFamily string       `json:"terminalFontFamily"`
	TerminalFontSize   int          `json:"terminalFontSize"`
	Window             WindowBounds `json:"window"`
	GlassEnabled       bool         `json:"glassEnabled"`
	SidebarCollapsed   bool         `json:"sidebarCollapsed"`
	Accent             string       `json:"accent"`
	DefaultShell       string       `json:"defaultShell"`
	CollapsedGroups    []string     `json:"collapsedGroups"`
}

func DefaultPreferences() Preferences {
	return Preferences{
		Theme:              "system",
		TerminalFontFamily: "Cascadia Mono, Consolas, monospace",
		TerminalFontSize:   14,
		Window:             WindowBounds{Width: 1200, Height: 780},
		GlassEnabled:       true,
		SidebarCollapsed:   false,
		Accent:             "system",
		DefaultShell:       "powershell",
		CollapsedGroups:    []string{},
	}
}

type PreferenceStore struct {
	store *vault.Store
}

func NewPreferenceStore(store *vault.Store) *PreferenceStore {
	return &PreferenceStore{store: store}
}

func (s *PreferenceStore) Get() (Preferences, error) {
	preferences := DefaultPreferences()
	if ok, err := s.store.Preference(preferencesKey, &preferences); err != nil {
		return Preferences{}, err
	} else if ok {
		return normalizedPreferences(preferences), nil
	}

	var theme string
	if ok, err := s.store.Preference("theme", &theme); err != nil {
		return Preferences{}, err
	} else if ok {
		preferences.Theme = theme
	}
	var window WindowBounds
	if ok, err := s.store.Preference("window", &window); err != nil {
		return Preferences{}, err
	} else if ok {
		preferences.Window = window
	}
	var font migrate001.TerminalFont
	if ok, err := s.store.Preference(migrate001.PrefLegacyTerminalFont, &font); err != nil {
		return Preferences{}, err
	} else if ok {
		preferences.TerminalFontFamily = font.Family
		preferences.TerminalFontSize = font.Size
	}
	return normalizedPreferences(preferences), nil
}

func (s *PreferenceStore) Save(preferences Preferences) error {
	return s.store.SetPreference(preferencesKey, normalizedPreferences(preferences))
}

func normalizedPreferences(preferences Preferences) Preferences {
	defaults := DefaultPreferences()
	switch preferences.Theme {
	case "system", "light", "dark":
	default:
		preferences.Theme = defaults.Theme
	}
	font := strings.TrimSpace(preferences.TerminalFontFamily)
	if !utf8.ValidString(font) || utf8.RuneCountInString(font) < 1 || utf8.RuneCountInString(font) > 200 {
		font = defaults.TerminalFontFamily
	}
	preferences.TerminalFontFamily = font
	if preferences.TerminalFontSize < 8 || preferences.TerminalFontSize > 32 {
		preferences.TerminalFontSize = defaults.TerminalFontSize
	}
	if preferences.Window.Width < 400 || preferences.Window.Width > 10_000 ||
		preferences.Window.Height < 300 || preferences.Window.Height > 10_000 {
		preferences.Window = defaults.Window
	}
	if preferences.DefaultShell != "powershell" && preferences.DefaultShell != "cmd" {
		preferences.DefaultShell = defaults.DefaultShell
	}
	if !ValidAccent(preferences.Accent) {
		preferences.Accent = defaults.Accent
	}
	if preferences.CollapsedGroups == nil {
		preferences.CollapsedGroups = []string{}
	}
	return preferences
}

func ValidAccent(value string) bool { return value == "system" || accentID.MatchString(value) }

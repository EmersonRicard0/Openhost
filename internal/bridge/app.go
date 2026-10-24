package bridge

import (
	"context"
	"net/url"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"shellvault/internal/apperr"
	"shellvault/internal/appwin"
	"shellvault/internal/validate"
)

type Appearance struct {
	Glass        bool `json:"glass"`
	HighContrast bool `json:"highContrast"`
	Dark         bool `json:"dark"`
}

type PreferencesPatch map[string]any

type AppService struct {
	preferences *appwin.PreferenceStore
	closeGuard  *appwin.CloseGuard
	context     func() context.Context
	emit        func(string, any)

	minimise       func(context.Context)
	toggleMaximise func(context.Context)
	quit           func(context.Context)
	openURL        func(context.Context, string)
}

func newAppService(
	preferences *appwin.PreferenceStore,
	closeGuard *appwin.CloseGuard,
	contextFn func() context.Context,
	emit func(string, any),
) *AppService {
	return &AppService{
		preferences: preferences,
		closeGuard:  closeGuard,
		context:     contextFn,
		emit:        emit,
		minimise:    wruntime.WindowMinimise,
		toggleMaximise: func(ctx context.Context) {
			wruntime.WindowToggleMaximise(ctx)
		},
		quit:    wruntime.Quit,
		openURL: wruntime.BrowserOpenURL,
	}
}

func (s *AppService) GetAppearance() (Appearance, error) {
	preferences, err := s.preferences.Get()
	if err != nil {
		return Appearance{}, clean(err)
	}
	return appearanceOf(preferences), nil
}

func (s *AppService) GetPreferences() (appwin.Preferences, error) {
	preferences, err := s.preferences.Get()
	return preferences, clean(err)
}

func (s *AppService) UpdatePreferences(patch PreferencesPatch) (appwin.Preferences, error) {
	if patch == nil {
		return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
	}
	preferences, err := s.preferences.Get()
	if err != nil {
		return appwin.Preferences{}, clean(err)
	}
	for key, raw := range patch {
		switch key {
		case "theme":
			value, ok := raw.(string)
			if !ok || validate.OneOf(value, "system", "light", "dark") != nil {
				return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
			}
			preferences.Theme = value
		case "terminalFontFamily":
			value, ok := raw.(string)
			if !ok {
				return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
			}
			value, err = validate.Text(value, 1, 200)
			if err != nil {
				return appwin.Preferences{}, clean(err)
			}
			preferences.TerminalFontFamily = value
		case "terminalFontSize":
			value, ok := bridgeInt(raw)
			if !ok || validate.Int(value, 8, 32) != nil {
				return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
			}
			preferences.TerminalFontSize = value
		case "glassEnabled":
			value, ok := raw.(bool)
			if !ok {
				return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
			}
			preferences.GlassEnabled = value
		case "defaultShell":
			value, ok := raw.(string)
			if !ok || validate.OneOf(value, "powershell", "cmd") != nil {
				return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
			}
			preferences.DefaultShell = value
		case "collapsedGroups":
			groups, ok := bridgeStrings(raw)
			if !ok || len(groups) > 5000 {
				return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
			}
			seen := make(map[string]bool, len(groups))
			preferences.CollapsedGroups = preferences.CollapsedGroups[:0]
			for _, id := range groups {
				if validate.UUID(id) != nil || seen[id] {
					return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
				}
				seen[id] = true
				preferences.CollapsedGroups = append(preferences.CollapsedGroups, id)
			}
		default:
			return appwin.Preferences{}, apperr.New(apperr.InvalidInput)
		}
	}
	if err := s.preferences.Save(preferences); err != nil {
		return appwin.Preferences{}, clean(err)
	}
	s.emit("app:appearance", appearanceOf(preferences))
	return preferences, nil
}

func (s *AppService) ConfirmClose(confirmed bool) error {
	s.closeGuard.Confirm(confirmed)
	return nil
}

func (s *AppService) WindowMinimise() error {
	s.minimise(s.context())
	return nil
}

func (s *AppService) WindowToggleMaximise() error {
	s.toggleMaximise(s.context())
	return nil
}

func (s *AppService) WindowClose() error {
	if !s.closeGuard.Intercept() {
		s.quit(s.context())
	}
	return nil
}

func (s *AppService) OpenExternalUrl(rawURL string) error {
	parsed, err := url.ParseRequestURI(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
		return apperr.New(apperr.InvalidInput)
	}
	s.openURL(s.context(), parsed.String())
	return nil
}

func appearanceOf(preferences appwin.Preferences) Appearance {
	return Appearance{
		Glass: preferences.GlassEnabled,
		Dark:  preferences.Theme != "light",
	}
}

func bridgeStrings(value any) ([]string, bool) {
	switch values := value.(type) {
	case []string:
		return append([]string{}, values...), true
	case []any:
		out := make([]string, len(values))
		for i, value := range values {
			text, ok := value.(string)
			if !ok {
				return nil, false
			}
			out[i] = text
		}
		return out, true
	default:
		return nil, false
	}
}

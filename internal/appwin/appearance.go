package appwin

import (
	"context"
	"sync"
	"time"
)

type SystemAppearance struct {
	TransparencyEnabled bool
	AppsUseLightTheme   bool
	HighContrast        bool
	SystemAccent        *string
}

type Appearance struct {
	Glass        bool    `json:"glass"`
	HighContrast bool    `json:"highContrast"`
	Dark         bool    `json:"dark"`
	SystemAccent *string `json:"systemAccent"`
}

type AppearanceReader interface {
	ReadAppearance() (SystemAppearance, error)
}

type AppearanceMonitor struct {
	reader      AppearanceReader
	preferences func() (Preferences, error)
	emit        func(Appearance)
	interval    time.Duration

	once sync.Once
}

func NewAppearanceMonitor(reader AppearanceReader, preferences func() (Preferences, error), emit func(Appearance)) *AppearanceMonitor {
	return &AppearanceMonitor{reader: reader, preferences: preferences, emit: emit, interval: time.Second}
}

func ResolveAppearance(system SystemAppearance, preferences Preferences) Appearance {
	return Appearance{
		Glass:        preferences.GlassEnabled && system.TransparencyEnabled && !system.HighContrast,
		HighContrast: system.HighContrast,
		Dark:         !system.AppsUseLightTheme,
		SystemAccent: system.SystemAccent,
	}
}

func (m *AppearanceMonitor) Current() Appearance {
	preferences, prefErr := m.preferences()
	system, systemErr := m.reader.ReadAppearance()
	if prefErr != nil || systemErr != nil {
		return Appearance{Glass: false, Dark: true}
	}
	return ResolveAppearance(system, preferences)
}

func (m *AppearanceMonitor) Start(ctx context.Context) {
	m.once.Do(func() { go m.watch(ctx) })
}

func (m *AppearanceMonitor) EmitCurrent() { m.emit(m.Current()) }

func (m *AppearanceMonitor) watch(ctx context.Context) {
	last := m.Current()
	m.emit(last)
	ticker := time.NewTicker(m.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			next := m.Current()
			if !sameAppearance(next, last) {
				last = next
				m.emit(next)
			}
		}
	}
}

func sameAppearance(a, b Appearance) bool {
	if a.Glass != b.Glass || a.HighContrast != b.HighContrast || a.Dark != b.Dark {
		return false
	}
	if a.SystemAccent == nil || b.SystemAccent == nil {
		return a.SystemAccent == nil && b.SystemAccent == nil
	}
	return *a.SystemAccent == *b.SystemAccent
}

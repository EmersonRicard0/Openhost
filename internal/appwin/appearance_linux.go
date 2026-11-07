//go:build linux

package appwin

import (
	"context"
	"time"

	"github.com/godbus/dbus/v5"
)

const (
	portalDest      = "org.freedesktop.portal.Desktop"
	portalPath      = "/org/freedesktop/portal/desktop"
	portalReadOne   = "org.freedesktop.portal.Settings.ReadOne"
	portalRead      = "org.freedesktop.portal.Settings.Read"
	portalNamespace = "org.freedesktop.appearance"
	portalTimeout   = 500 * time.Millisecond
)

// PortalAppearanceReader lê a aparência pelo portal XDG (GNOME, KDE e outros). Sem portal ou sem
// sessão D-Bus, devolve tema claro sem destaque; a interface ainda segue prefers-color-scheme.
type PortalAppearanceReader struct{}

// SystemAppearanceReader é o leitor de aparência deste sistema.
func SystemAppearanceReader() AppearanceReader { return PortalAppearanceReader{} }

func (PortalAppearanceReader) ReadAppearance() (SystemAppearance, error) {
	conn, err := dbus.SessionBus()
	if err != nil {
		return portalAppearance(portalValues{}), nil
	}
	portal := conn.Object(portalDest, portalPath)
	var values portalValues
	if v, ok := readPortal(portal, "color-scheme"); ok {
		if scheme, ok := v.(uint32); ok {
			values.ColorScheme = &scheme
		}
	}
	if v, ok := readPortal(portal, "contrast"); ok {
		if contrast, ok := v.(uint32); ok {
			values.Contrast = &contrast
		}
	}
	if v, ok := readPortal(portal, "accent-color"); ok {
		values.AccentColor = accentTuple(v)
	}
	return portalAppearance(values), nil
}

// readPortal usa ReadOne (portal versão 2) e cai no Read antigo, que embrulha o valor numa
// variante a mais.
func readPortal(portal dbus.BusObject, key string) (any, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), portalTimeout)
	defer cancel()
	var value dbus.Variant
	if err := portal.CallWithContext(ctx, portalReadOne, 0, portalNamespace, key).Store(&value); err == nil {
		return value.Value(), true
	}
	if err := portal.CallWithContext(ctx, portalRead, 0, portalNamespace, key).Store(&value); err != nil {
		return nil, false
	}
	if inner, ok := value.Value().(dbus.Variant); ok {
		return inner.Value(), true
	}
	return value.Value(), true
}

// accentTuple aceita a tupla (ddd) do portal, que o godbus entrega como []any.
func accentTuple(v any) *[3]float64 {
	parts, ok := v.([]any)
	if !ok || len(parts) != 3 {
		return nil
	}
	var rgb [3]float64
	for i, p := range parts {
		f, ok := p.(float64)
		if !ok {
			return nil
		}
		rgb[i] = f
	}
	return &rgb
}

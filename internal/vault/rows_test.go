package vault

import (
	"testing"

	"shellvault/internal/model"
)

func TestDecodeOldHostDefaultsOSFields(t *testing.T) {
	content := model.EmptyContent()
	plain := []byte(`{"label":"Antigo","address":"localhost","port":22,"username":"ops","authMethod":"ask","credentialId":null,"legacyAlgorithms":false,"profileId":null}`)
	cols := []any{nil, int64(0), "2026-10-25T12:00:00.000Z", "2026-10-25T12:00:00.000Z"}
	if err := decodeRow(content, "hosts", "4ce66518-3068-4bef-ad0b-eb3f0141443d", cols, plain); err != nil {
		t.Fatal(err)
	}
	host := content.Hosts[0]
	if host.DetectedOS != nil || host.OSIcon != model.OSIconAuto {
		t.Fatalf("campos de SO do host antigo = detectedOs %v, osIcon %q", host.DetectedOS, host.OSIcon)
	}
}

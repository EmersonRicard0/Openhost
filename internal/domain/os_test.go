package domain

import "testing"

func TestValidOSIDAcceptsNewVendors(t *testing.T) {
	for _, id := range []string{"zte", "datacom", "hillstone"} {
		if !ValidOSID(id) {
			t.Errorf("ValidOSID(%q) = false", id)
		}
	}
}

func TestIsNetworkOSExactSet(t *testing.T) {
	network := map[string]bool{
		OSMikroTik:  true,
		OSCisco:     true,
		OSHuawei:    true,
		OSJuniper:   true,
		OSHPE:       true,
		OSFortinet:  true,
		OSZTE:       true,
		OSDatacom:   true,
		OSHillstone: true,
	}
	all := []string{
		OSUbuntu, OSDebian, OSCentOS, OSRHEL, OSFedora, OSRocky, OSAlma, OSAlpine,
		OSArch, OSOpenSUSE, OSOracle, OSAmazon, OSLinux, OSFreeBSD, OSOpenBSD,
		OSWindows, OSMacOS, OSMikroTik, OSCisco, OSHuawei, OSJuniper, OSHPE,
		OSFortinet, OSOpenWrt, OSZTE, OSDatacom, OSHillstone, "", "unknown",
	}
	for _, id := range all {
		if got := IsNetworkOS(id); got != network[id] {
			t.Errorf("IsNetworkOS(%q) = %v, esperado %v", id, got, network[id])
		}
	}
}

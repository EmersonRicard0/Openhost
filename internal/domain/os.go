package domain

import "shellvault/internal/model"

const (
	OSUbuntu    = "ubuntu"
	OSDebian    = "debian"
	OSCentOS    = "centos"
	OSRHEL      = "rhel"
	OSFedora    = "fedora"
	OSRocky     = "rocky"
	OSAlma      = "almalinux"
	OSAlpine    = "alpine"
	OSArch      = "arch"
	OSOpenSUSE  = "opensuse"
	OSOracle    = "oracle"
	OSAmazon    = "amazon"
	OSLinux     = "linux"
	OSFreeBSD   = "freebsd"
	OSOpenBSD   = "openbsd"
	OSWindows   = "windows"
	OSMacOS     = "macos"
	OSMikroTik  = "mikrotik"
	OSCisco     = "cisco"
	OSHuawei    = "huawei"
	OSJuniper   = "juniper"
	OSHPE       = "hpe"
	OSFortinet  = "fortinet"
	OSOpenWrt   = "openwrt"
	OSZTE       = "zte"
	OSDatacom   = "datacom"
	OSHillstone = "hillstone"
)

var validOSIDs = map[string]struct{}{
	OSUbuntu: {}, OSDebian: {}, OSCentOS: {}, OSRHEL: {}, OSFedora: {}, OSRocky: {}, OSAlma: {},
	OSAlpine: {}, OSArch: {}, OSOpenSUSE: {}, OSOracle: {}, OSAmazon: {}, OSLinux: {},
	OSFreeBSD: {}, OSOpenBSD: {}, OSWindows: {}, OSMacOS: {}, OSMikroTik: {}, OSCisco: {},
	OSHuawei: {}, OSJuniper: {}, OSHPE: {}, OSFortinet: {}, OSOpenWrt: {}, OSZTE: {},
	OSDatacom: {}, OSHillstone: {},
}

func ValidOSID(id string) bool {
	_, ok := validOSIDs[id]
	return ok
}

func ValidOSIcon(icon string) bool {
	return icon == model.OSIconAuto || ValidOSID(icon)
}

func IsNetworkOS(id string) bool {
	switch id {
	case OSMikroTik, OSCisco, OSHuawei, OSJuniper, OSHPE, OSFortinet, OSZTE, OSDatacom, OSHillstone:
		return true
	default:
		return false
	}
}

// SetDetectedOS altera somente o campo controlado pela detecção do backend.
func SetDetectedOS(c *model.Content, hostID string, detected *string, now string) (bool, error) {
	if detected != nil && !ValidOSID(*detected) {
		return false, invalid()
	}
	i := hostIndex(c, hostID)
	if i < 0 {
		return false, notFound()
	}
	current := c.Hosts[i].DetectedOS
	if (current == nil && detected == nil) || (current != nil && detected != nil && *current == *detected) {
		return false, nil
	}
	if detected == nil {
		c.Hosts[i].DetectedOS = nil
	} else {
		c.Hosts[i].DetectedOS = model.Ptr(*detected)
	}
	c.Hosts[i].UpdatedAt = now
	return true, nil
}

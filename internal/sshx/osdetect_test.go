package sshx

import "testing"

func TestClassifyServerVersion(t *testing.T) {
	tests := []struct {
		version string
		want    string
		probe   bool
	}{
		{"SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13", "ubuntu", false},
		{"SSH-2.0-OpenSSH_9.2p1 Debian-2+deb12u3", "debian", false},
		{"SSH-2.0-OpenSSH_9.7 FreeBSD-20240318", "freebsd", false},
		{"SSH-2.0-OpenSSH_for_Windows_9.5", "windows", false},
		{"SSH-2.0-ROSSSH", "mikrotik", false},
		{"SSH-2.0-Cisco-1.25", "cisco", false},
		{"SSH-2.0-HUAWEI-1.5", "huawei", false},
		{"SSH-2.0-Comware-7.1", "hpe", false},
		{"SSH-2.0-JUNOS-12.3", "juniper", false},
		{"SSH-2.0-FortiGate-7.4", "fortinet", false},
		{"SSH-2.0-ZTE_SSHD_1.0", "zte", false},
		{"SSH-2.0-Datacom-DmOS", "datacom", false},
		{"SSH-2.0-Hillstone-StoneOS", "hillstone", false},
		{"SSH-2.0-FortiSSH_7.6", "fortinet", false},
		{"SSH-2.0-OpenSSH_9.6p1", "", true},
		{"SSH-2.0-dropbear_2022.83", "", true},
		{"SSH-2.0-Apache-SSHD-2.12.0", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.version, func(t *testing.T) {
			got, probe := ClassifyServerVersion(tt.version)
			if got != tt.want || probe != tt.probe {
				t.Fatalf("ClassifyServerVersion(%q) = %q, %v; esperado %q, %v", tt.version, got, probe, tt.want, tt.probe)
			}
		})
	}
}

func TestResolveOS(t *testing.T) {
	tests := []struct {
		name    string
		signals Signals
		want    string
	}{
		{
			name: "versão não rede vence tudo",
			signals: Signals{Version: "SSH-2.0-OpenSSH Ubuntu", Banner: "JUNOS",
				OSRelease: "ID=debian", ProbeOSRelease: true, Terminal: []byte("Cisco IOS")},
			want: "ubuntu",
		},
		{
			name: "versão de fabricante vence banner",
			signals: Signals{Version: "SSH-2.0-HUAWEI", Banner: "ZXR10",
				Terminal: []byte("JUNOS")},
			want: "huawei",
		},
		{
			name: "banner vence os release e terminal",
			signals: Signals{Version: "SSH-2.0-OpenSSH", Banner: "ZTE Corporation",
				OSRelease: "ID=ubuntu", ProbeOSRelease: true, Terminal: []byte("Cisco IOS")},
			want: "zte",
		},
		{
			name: "os release vence terminal",
			signals: Signals{Version: "SSH-2.0-OpenSSH", OSRelease: "ID=ubuntu",
				ProbeOSRelease: true, Terminal: []byte("Cisco IOS")},
			want: "ubuntu",
		},
		{
			name: "terminal decide sem os release",
			signals: Signals{Version: "SSH-2.0-OpenSSH", ProbeOSRelease: true,
				Terminal: []byte("Cisco IOS-XE Software")},
			want: "cisco",
		},
		{
			name: "os release presente é um sinal",
			signals: Signals{OSRelease: "ID=ubuntu", ProbeOSRelease: false,
				Terminal: []byte("JUNOS")},
			want: "ubuntu",
		},
		{name: "nenhum sinal", signals: Signals{}, want: ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ResolveOS(test.signals); got != test.want {
				t.Fatalf("ResolveOS() = %q, esperado %q", got, test.want)
			}
		})
	}
}

func TestClassifyOSRelease(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{"ubuntu", "NAME=Ubuntu\nID=ubuntu\nID_LIKE=debian\n", "ubuntu"},
		{"rocky", "ID=rocky\nID_LIKE=\"rhel centos fedora\"\n", "rocky"},
		{"oracle", "ID=ol\nID_LIKE=\"fedora rhel centos\"\n", "oracle"},
		{"amazon", "ID=amzn\nID_LIKE=fedora\n", "amazon"},
		{"opensuse", "ID=opensuse-tumbleweed\nID_LIKE=\"suse opensuse\"\n", "opensuse"},
		{"openwrt", "ID=\"openwrt\"\n", "openwrt"},
		{"id like", "NAME=Custom\nID=custom\nID_LIKE=\"arch linux\"\n", "arch"},
		{"linux desconhecido", "NAME=Appliance\nID=appliance\n", "linux"},
		{"inválido", "NAME=sem-id\n", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ClassifyOSRelease([]byte(tt.raw)); got != tt.want {
				t.Fatalf("ClassifyOSRelease() = %q, esperado %q", got, tt.want)
			}
		})
	}
}

package sshx

import "testing"

func TestNormalizeText(t *testing.T) {
	tests := []struct {
		name string
		in   []byte
		want string
	}{
		{"csi", []byte("\x1b[31mHuawei\x1b[0m VRP"), "huawei vrp"},
		{"osc bel", []byte("antes\x1b]0;título\x07DEPOIS"), "antesdepois"},
		{"osc st", []byte("\x1b]8;;https://example.test\x1b\\Cisco IOS\x1b]8;;\x1b\\"), "cisco ios"},
		{"escape simples", []byte("a\x1b7b\x1bMc"), "abc"},
		{"quebras e controles", []byte("A\r\nB\t\x00C"), "a\n\nbc"},
		{"utf8 inválido", []byte{'D', 'm', 'O', 'S', 0xff, 'X'}, "dmos x"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := normalizeText(test.in); got != test.want {
				t.Fatalf("normalizeText(%q) = %q, esperado %q", test.in, got, test.want)
			}
		})
	}
}

func TestVendorTextSignatures(t *testing.T) {
	tests := []struct {
		id     string
		needle string
	}{
		{"huawei", "Huawei Versatile Routing Platform"},
		{"huawei", "VRP (R) software"},
		{"huawei", "Huawei Technologies"},
		{"huawei", "The max number of VTY users"},
		{"huawei", "The initial password poses security risks"},
		{"zte", "ZXR10"},
		{"zte", "ZXAN"},
		{"zte", "ZTE Corporation"},
		{"datacom", "DmOS"},
		{"datacom", "DMSwitch"},
		{"datacom", "Datacom DM2500"},
		{"cisco", "Cisco IOS"},
		{"cisco", "Cisco Nexus"},
		{"cisco", "Cisco Adaptive Security Appliance"},
		{"cisco", "IOS-XE"},
		{"cisco", "IOS XR"},
		{"cisco", "NX-OS"},
		{"cisco", "Type help or '?' for a list of available commands"},
		{"juniper", "JUNOS"},
		{"juniper", "Juniper Networks"},
		{"hillstone", "Hillstone Networks"},
		{"hillstone", "StoneOS"},
		{"fortinet", "FortiOS"},
		{"mikrotik", "MikroTik RouterOS"},
		{"hpe", "Comware Software"},
		{"hpe", "Hewlett Packard Enterprise Development"},
		{"hpe", "ArubaOS"},
		{"hpe", "ProCurve"},
	}
	for _, test := range tests {
		t.Run(test.id+"/"+test.needle, func(t *testing.T) {
			text := "\x1b[32m" + test.needle + "\x1b[0m\r\n"
			if got := ClassifyBanner(text); got != test.id {
				t.Errorf("ClassifyBanner(%q) = %q, esperado %q", test.needle, got, test.id)
			}
			if got := ClassifyTerminal([]byte(text)); got != test.id {
				t.Errorf("ClassifyTerminal(%q) = %q, esperado %q", test.needle, got, test.id)
			}
		})
	}
}

func TestVendorTerminalPromptsAreLineAnchored(t *testing.T) {
	positives := []struct {
		text string
		want string
	}{
		{"aviso\r\nfw-matriz # \r\n", "fortinet"},
		{"FGT60F-LAB (global) # ", "fortinet"},
		{"SG-6000-E3960# ", "hillstone"},
		{"\x1b[32m[admin@router-1] > \x1b[0m", "mikrotik"},
	}
	for _, test := range positives {
		if got := ClassifyTerminal([]byte(test.text)); got != test.want {
			t.Errorf("ClassifyTerminal(%q) = %q, esperado %q", test.text, got, test.want)
		}
	}

	for _, text := range []string{
		"cisco",
		"Bem-vindo ao laboratório Cisco",
		"prefixo FGT60F #",
		"FGT60F # sufixo",
		"router$",
		"use [admin@router] > para continuar",
		"backup Juniper",
		"Fortinet VPN",
	} {
		if got := ClassifyTerminal([]byte(text)); got != "" {
			t.Errorf("falso positivo em %q: %q", text, got)
		}
	}
}

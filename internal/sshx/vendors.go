package sshx

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"shellvault/internal/domain"
)

const maxVendorTextBytes = 8 * 1024

type vendorTextSignature struct {
	id     string
	needle string
}

var vendorTextSignatures = []vendorTextSignature{
	{domain.OSHuawei, "huawei versatile routing platform"},
	{domain.OSHuawei, "vrp (r) software"},
	{domain.OSHuawei, "huawei technologies"},
	{domain.OSHuawei, "the max number of vty users"},
	{domain.OSHuawei, "the initial password poses security risks"},
	{domain.OSZTE, "zxr10"},
	{domain.OSZTE, "zxan"},
	{domain.OSZTE, "zte corporation"},
	{domain.OSDatacom, "dmos"},
	{domain.OSDatacom, "dmswitch"},
	{domain.OSDatacom, "datacom dm"},
	{domain.OSCisco, "cisco ios"},
	{domain.OSCisco, "cisco nexus"},
	{domain.OSCisco, "cisco adaptive security appliance"},
	{domain.OSCisco, "ios-xe"},
	{domain.OSCisco, "ios xr"},
	{domain.OSCisco, "nx-os"},
	{domain.OSCisco, "type help or '?' for a list of available commands"},
	{domain.OSJuniper, "junos"},
	{domain.OSJuniper, "juniper networks"},
	{domain.OSHillstone, "hillstone networks"},
	{domain.OSHillstone, "stoneos"},
	{domain.OSFortinet, "fortios"},
	{domain.OSMikroTik, "mikrotik routeros"},
	{domain.OSHPE, "comware software"},
	{domain.OSHPE, "hewlett packard enterprise development"},
	{domain.OSHPE, "arubaos"},
	{domain.OSHPE, "procurve"},
}

var vendorTerminalPrompts = []struct {
	id      string
	pattern *regexp.Regexp
}{
	{domain.OSHillstone, regexp.MustCompile(`(?m)^sg-6000[0-9a-z_-]*[#>] ?$`)},
	{domain.OSFortinet, regexp.MustCompile(`(?m)^[0-9a-z_.-]+ (\([0-9a-z_-]+\) )?# ?$`)},
	{domain.OSMikroTik, regexp.MustCompile(`(?m)^\[[^@\]]+@[^\]]+\] > ?$`)},
}

// normalizeText remove sequências de controle antes de comparar texto recebido do servidor.
// O resultado só existe em memória e nunca é incluído em logs ou erros.
func normalizeText(input []byte) string {
	var normalized strings.Builder
	normalized.Grow(len(input))
	for i := 0; i < len(input); {
		if input[i] == 0x1b {
			i = skipEscapeSequence(input, i)
			continue
		}
		if input[i] == '\r' {
			normalized.WriteByte('\n')
			i++
			continue
		}
		r, size := utf8.DecodeRune(input[i:])
		if r == utf8.RuneError && size == 1 {
			normalized.WriteByte(' ')
			i++
			continue
		}
		i += size
		if r == '\n' {
			normalized.WriteByte('\n')
			continue
		}
		if unicode.IsControl(r) {
			continue
		}
		normalized.WriteRune(unicode.ToLower(r))
	}
	return normalized.String()
}

func skipEscapeSequence(input []byte, start int) int {
	if start+1 >= len(input) {
		return len(input)
	}
	switch input[start+1] {
	case '[':
		for i := start + 2; i < len(input); i++ {
			if input[i] >= 0x40 && input[i] <= 0x7e {
				return i + 1
			}
		}
		return len(input)
	case ']':
		for i := start + 2; i < len(input); i++ {
			switch {
			case input[i] == 0x07:
				return i + 1
			case input[i] == 0x1b && i+1 < len(input) && input[i+1] == '\\':
				return i + 2
			}
		}
		return len(input)
	default:
		return start + 2
	}
}

func classifyVendorText(input []byte, includePrompts bool) string {
	normalized := normalizeText(input)
	for _, signature := range vendorTextSignatures {
		if strings.Contains(normalized, signature.needle) {
			return signature.id
		}
	}
	if includePrompts {
		for _, prompt := range vendorTerminalPrompts {
			if prompt.pattern.MatchString(normalized) {
				return prompt.id
			}
		}
	}
	return ""
}

func ClassifyBanner(text string) string {
	return classifyVendorText([]byte(text), false)
}

func ClassifyTerminal(text []byte) string {
	return classifyVendorText(text, true)
}

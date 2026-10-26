package sshx

import (
	"bufio"
	"context"
	"io"
	"strings"
	"time"

	"shellvault/internal/domain"
)

const (
	osReleaseTimeout  = 3 * time.Second
	maxOSReleaseBytes = 8 * 1024
)

// ClassifyServerVersion reconhece sistemas expostos pelo banner SSH. O segundo retorno diz se
// um servidor Unix genérico pode receber a leitura segura de /etc/os-release.
func ClassifyServerVersion(version string) (string, bool) {
	lower := strings.ToLower(version)
	network := []struct {
		needles []string
		id      string
	}{
		{[]string{"rosssh", "routeros"}, domain.OSMikroTik},
		{[]string{"cisco"}, domain.OSCisco},
		{[]string{"huawei"}, domain.OSHuawei},
		{[]string{"junos", "juniper"}, domain.OSJuniper},
		{[]string{"comware", "aruba", "procurve"}, domain.OSHPE},
		{[]string{"fortigate", "fortinet"}, domain.OSFortinet},
	}
	for _, candidate := range network {
		for _, needle := range candidate.needles {
			if strings.Contains(lower, needle) {
				return candidate.id, false
			}
		}
	}
	direct := []struct {
		needles []string
		id      string
	}{
		{[]string{"openssh_for_windows", " win32", " windows"}, domain.OSWindows},
		{[]string{"ubuntu"}, domain.OSUbuntu},
		{[]string{"debian"}, domain.OSDebian},
		{[]string{"freebsd"}, domain.OSFreeBSD},
		{[]string{"openbsd"}, domain.OSOpenBSD},
		{[]string{"macos", "darwin"}, domain.OSMacOS},
	}
	for _, candidate := range direct {
		for _, needle := range candidate.needles {
			if strings.Contains(lower, needle) {
				return candidate.id, false
			}
		}
	}
	if strings.Contains(lower, "openssh") || strings.Contains(lower, "dropbear") {
		return "", true
	}
	return "", false
}

func osReleaseID(value string) string {
	value = strings.ToLower(strings.TrimSpace(strings.Trim(value, `"'`)))
	switch value {
	case "ubuntu":
		return domain.OSUbuntu
	case "debian", "raspbian":
		return domain.OSDebian
	case "centos":
		return domain.OSCentOS
	case "rhel", "redhat", "redhatenterpriseserver":
		return domain.OSRHEL
	case "fedora":
		return domain.OSFedora
	case "rocky":
		return domain.OSRocky
	case "almalinux":
		return domain.OSAlma
	case "alpine":
		return domain.OSAlpine
	case "arch", "archlinux":
		return domain.OSArch
	case "opensuse", "opensuse-leap", "opensuse-tumbleweed", "suse", "sles":
		return domain.OSOpenSUSE
	case "ol", "oracle", "oraclelinux":
		return domain.OSOracle
	case "amzn", "amazon":
		return domain.OSAmazon
	case "openwrt":
		return domain.OSOpenWrt
	case "linux":
		return domain.OSLinux
	}
	if strings.HasPrefix(value, "opensuse") {
		return domain.OSOpenSUSE
	}
	return ""
}

// ClassifyOSRelease interpreta apenas ID e ID_LIKE; nenhum conteúdo é executado.
func ClassifyOSRelease(data []byte) string {
	values := map[string]string{}
	scanner := bufio.NewScanner(strings.NewReader(string(data)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "ID" || key == "ID_LIKE" {
			values[key] = strings.TrimSpace(strings.Trim(value, `"'`))
		}
	}
	if id := osReleaseID(values["ID"]); id != "" {
		return id
	}
	for _, like := range strings.Fields(values["ID_LIKE"]) {
		if id := osReleaseID(like); id != "" {
			return id
		}
	}
	if values["ID"] != "" {
		return domain.OSLinux
	}
	return ""
}

// DetectOS usa o banner autenticado e, só para OpenSSH/dropbear genérico, um canal exec separado.
// Falhas são deliberadamente silenciosas: detectar o ícone nunca pode impedir a sessão do usuário.
func (c *Client) DetectOS(ctx context.Context) string {
	if id, probe := ClassifyServerVersion(string(c.ServerVersion())); id != "" || !probe {
		return id
	}
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, osReleaseTimeout)
	defer cancel()
	sess, err := c.NewSession()
	if err != nil {
		return ""
	}
	stdout, err := sess.StdoutPipe()
	if err != nil {
		_ = sess.Close()
		return ""
	}
	sess.Stderr = io.Discard
	started := make(chan error, 1)
	go func() { started <- sess.Start("cat /etc/os-release") }()
	select {
	case <-ctx.Done():
		_ = sess.Close()
		return ""
	case err := <-started:
		if err != nil {
			_ = sess.Close()
			return ""
		}
	}
	type result struct {
		data []byte
		err  error
	}
	done := make(chan result, 1)
	go func() {
		data, readErr := io.ReadAll(io.LimitReader(stdout, maxOSReleaseBytes+1))
		waitErr := sess.Wait()
		if readErr != nil {
			waitErr = readErr
		}
		done <- result{data: data, err: waitErr}
	}()
	select {
	case <-ctx.Done():
		_ = sess.Close()
		return ""
	case got := <-done:
		if got.err != nil || len(got.data) > maxOSReleaseBytes {
			return ""
		}
		return ClassifyOSRelease(got.data)
	}
}

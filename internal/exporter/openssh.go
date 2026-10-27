package exporter

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

// SSHConfigMode diz como gravar no arquivo de destino (R11).
type SSHConfigMode string

const (
	// SSHConfigNewFile grava o arquivo inteiro com os blocos exportados.
	SSHConfigNewFile SSHConfigMode = "newFile"
	// SSHConfigAppend mantém o arquivo e troca só o trecho entre os marcadores do OpenHost.
	SSHConfigAppend SSHConfigMode = "append"
)

const (
	markerBegin = "# >>> OpenHost"
	markerEnd   = "# <<< OpenHost"
)

// MarshalOpenSSH gera um bloco Host por host, na ordem do cofre, com o grupo e o rótulo
// originais no comentário acima (FR-327). Chaves e senhas não entram.
func MarshalOpenSSH(content *model.Content) []byte {
	paths := groupPaths(content.Groups)
	used := map[string]bool{}
	var b strings.Builder
	for i, host := range content.Hosts {
		if i > 0 {
			b.WriteByte('\n')
		}
		origin := host.Label
		if host.GroupID != nil && paths[*host.GroupID] != "" {
			origin = paths[*host.GroupID] + " / " + host.Label
		}
		fmt.Fprintf(&b, "# OpenHost: %s\n", oneLine(origin))
		fmt.Fprintf(&b, "Host %s\n", uniqueAlias(host.Label, used))
		fmt.Fprintf(&b, "  HostName %s\n", sshValue(host.Address))
		if host.Port != 22 {
			fmt.Fprintf(&b, "  Port %d\n", host.Port)
		}
		if host.Username != "" {
			fmt.Fprintf(&b, "  User %s\n", sshValue(host.Username))
		}
	}
	return []byte(b.String())
}

// WriteSSHConfig grava os blocos em path sem nunca deixar o arquivo truncado: escreve um
// temporário na mesma pasta e renomeia. Em SSHConfigAppend, guarda antes uma cópia
// path.bak-AAAAMMDD-HHMMSS e substitui só o trecho entre os marcadores (FR-328).
func WriteSSHConfig(path string, blocks []byte, mode SSHConfigMode, now time.Time) error {
	switch mode {
	case SSHConfigNewFile:
		return WriteFile(path, blocks)
	case SSHConfigAppend:
	default:
		return apperr.New(apperr.InvalidInput)
	}
	current, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return WriteFile(path, withMarkers(nil, blocks, "\n"))
	}
	if err != nil {
		return err
	}
	eol := "\n"
	if bytes.Contains(current, []byte("\r\n")) {
		eol = "\r\n"
	}
	next := withMarkers(current, blocks, eol)
	if begin := markerLine(current, markerBegin); begin >= 0 {
		end := markerLine(current[begin:], markerEnd)
		if end < 0 {
			bad := apperr.New(apperr.InvalidInput)
			bad.Detail = fmt.Sprintf("%q sem %q no arquivo de destino", markerBegin, markerEnd)
			return bad
		}
		end += begin
		after := current[end:]
		if i := bytes.IndexByte(after, '\n'); i >= 0 {
			after = after[i+1:]
		} else {
			after = nil
		}
		next = append(append([]byte{}, current[:begin]...), withMarkers(nil, blocks, eol)...)
		next = append(next, after...)
	}
	backup := path + ".bak-" + now.Format("20060102-150405")
	if err := os.WriteFile(backup, current, 0o600); err != nil {
		return err
	}
	return WriteFile(path, next)
}

// withMarkers devolve before seguido do trecho marcado, com uma linha em branco de separação
// quando before não está vazio.
func withMarkers(before, blocks []byte, eol string) []byte {
	var b bytes.Buffer
	b.Write(before)
	if len(before) > 0 {
		if !bytes.HasSuffix(before, []byte("\n")) {
			b.WriteString(eol)
		}
		b.WriteString(eol)
	}
	b.WriteString(markerBegin + eol)
	body := strings.ReplaceAll(strings.ReplaceAll(string(blocks), "\r\n", "\n"), "\n", eol)
	b.WriteString(body)
	if body != "" && !strings.HasSuffix(body, eol) {
		b.WriteString(eol)
	}
	b.WriteString(markerEnd + eol)
	return b.Bytes()
}

// markerLine devolve o início da primeira linha que é exatamente marker, ou -1.
func markerLine(data []byte, marker string) int {
	offset := 0
	for _, line := range bytes.SplitAfter(data, []byte("\n")) {
		if strings.TrimRight(string(line), "\r\n \t") == marker {
			return offset
		}
		offset += len(line)
	}
	return -1
}

// WriteFile grava data em path por um temporário na mesma pasta seguido de rename: quem lê
// o arquivo vê o conteúdo antigo ou o novo, nunca um pedaço.
func WriteFile(path string, data []byte) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+"-*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	_, err = tmp.Write(data)
	if err == nil {
		err = tmp.Sync()
	}
	if closeErr := tmp.Close(); err == nil {
		err = closeErr
	}
	if err == nil {
		err = os.Rename(name, path)
	}
	if err != nil {
		_ = os.Remove(name)
		return err
	}
	return nil
}

// uniqueAlias troca o que não for [A-Za-z0-9._-] por "-" (sem repetir hífens) e acrescenta
// -2, -3… quando o apelido já foi usado; o OpenSSH compara nomes sem diferenciar caixa.
func uniqueAlias(label string, used map[string]bool) string {
	var b strings.Builder
	dash := false
	for _, r := range label {
		ok := r < 128 && (r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '.' || r == '_' || r == '-')
		if ok && r != '-' {
			b.WriteRune(r)
			dash = false
		} else if !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	base := strings.Trim(b.String(), "-")
	if base == "" {
		base = "host"
	}
	alias := base
	for n := 2; used[strings.ToLower(alias)]; n++ {
		alias = base + "-" + strconv.Itoa(n)
	}
	used[strings.ToLower(alias)] = true
	return alias
}

// sshValue põe entre aspas valores com espaço, que o OpenSSH partiria em dois argumentos.
func sshValue(v string) string {
	v = oneLine(v)
	if strings.ContainsAny(v, " \t") {
		return `"` + strings.ReplaceAll(v, `"`, "") + `"`
	}
	return v
}

func oneLine(v string) string {
	return strings.Join(strings.Fields(strings.NewReplacer("\r", " ", "\n", " ").Replace(v)), " ")
}

// groupPaths devolve, para cada grupo, o caminho "Pai / Filho" desde a raiz.
func groupPaths(groups []model.Group) map[string]string {
	byID := make(map[string]model.Group, len(groups))
	for _, g := range groups {
		byID[g.ID] = g
	}
	paths := make(map[string]string, len(groups))
	var resolve func(id string, depth int) string
	resolve = func(id string, depth int) string {
		if p, ok := paths[id]; ok {
			return p
		}
		g, ok := byID[id]
		if !ok || depth > len(groups) {
			return ""
		}
		p := g.Name
		if g.ParentID != nil {
			if parent := resolve(*g.ParentID, depth+1); parent != "" {
				p = parent + " / " + g.Name
			}
		}
		paths[id] = p
		return p
	}
	for _, g := range groups {
		resolve(g.ID, 0)
	}
	return paths
}

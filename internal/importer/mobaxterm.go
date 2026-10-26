package importer

import (
	"bytes"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

const mobaSSHKeyField = 7

var mobaProtocolNames = map[string]string{
	"0": "SSH",
	"1": "Telnet",
	"2": "Rsh",
	"3": "Rlogin",
	"4": "RDP",
	"5": "VNC",
	"6": "FTP",
	"7": "SFTP",
	"8": "XDMCP",
	"9": "Serial",
}

// LoadMobaXterm reads bookmark sections from .mxtsessions and MobaXterm.ini.
// Password sections are deliberately skipped without parsing their entries.
func LoadMobaXterm(path string, content *model.Content) (*ImportPreview, error) {
	raw, err := readLimited(path)
	if err != nil {
		return nil, err
	}
	defer zero(raw)
	text, err := decodeImportText(raw)
	if err != nil {
		return nil, err
	}
	source := filepath.Base(path)
	dir := filepath.Dir(path)
	var rows []CandidateRow
	var ignored []IgnoredItem
	var fileWarnings []Warning
	var groupPath []string
	section := ""
	interpreted := false
	count := 0
	for index, rawLine := range strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		lineNumber := index + 1
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.ToLower(strings.TrimSpace(line[1 : len(line)-1]))
			groupPath = nil
			continue
		}
		if !strings.HasPrefix(section, "bookmarks") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			fileWarnings = append(fileWarnings, Warning{Code: WarningLineUnreadable, Line: model.Ptr(lineNumber)})
			continue
		}
		key, value = strings.TrimSpace(key), strings.TrimSpace(value)
		if strings.EqualFold(key, "SubRep") {
			groupPath = mobaGroupPath(value)
			interpreted = true
			continue
		}
		if strings.EqualFold(key, "ImgNum") {
			continue
		}
		count++
		if count > MaxRows {
			return nil, apperr.New(apperr.ImportTooLarge)
		}
		row, protocol, ok := parseMobaSession(key, value, groupPath, dir, lineNumber)
		if !ok {
			fileWarnings = append(fileWarnings, Warning{Code: WarningLineUnreadable, Line: model.Ptr(lineNumber)})
			continue
		}
		interpreted = true
		if protocol != "SSH" {
			ignored = append(ignored, IgnoredItem{Name: key, Reason: "Protocolo não suportado: " + protocol})
			continue
		}
		rows = append(rows, row)
	}
	if !interpreted {
		return nil, apperr.New(apperr.ImportUnreadable)
	}
	preview, err := Build(SourceMobaXterm, source, rows, content)
	if err != nil {
		return nil, err
	}
	preview.Ignored = ignored
	preview.FileWarnings = fileWarnings
	if err := preview.ResolveKeys(content); err != nil {
		preview.Zero()
		return nil, err
	}
	return preview, nil
}

func parseMobaSession(label, value string, groupPath []string, dir string, line int) (CandidateRow, string, bool) {
	row := CandidateRow{Label: label, GroupPath: append([]string(nil), groupPath...), Origin: "MobaXterm: " + label}
	if !strings.HasPrefix(value, "#") {
		return row, "", false
	}
	secondHash := strings.IndexByte(value[1:], '#')
	if secondHash < 0 {
		return row, "", false
	}
	payload := value[secondHash+2:]
	if suffix := strings.IndexByte(payload, '#'); suffix >= 0 {
		payload = payload[:suffix]
	}
	fields := strings.Split(payload, "%")
	if len(fields) < 4 {
		return row, "", false
	}
	protocol := mobaProtocolNames[strings.TrimSpace(fields[0])]
	if protocol == "" {
		protocol = "tipo " + strings.TrimSpace(fields[0])
	}
	row.Address = strings.TrimSpace(fields[1])
	if port := strings.TrimSpace(fields[2]); port != "" {
		parsed, err := strconv.Atoi(port)
		if err != nil || parsed == 0 {
			parsed = -1
		}
		row.Port = parsed
	}
	row.Username = strings.TrimSpace(fields[3])
	if protocol == "SSH" {
		row.KeyPath, row.Warnings = mobaKey(fields, dir, line)
	}
	return row, protocol, true
}

func mobaKey(fields []string, dir string, line int) (string, []Warning) {
	warning := func() []Warning {
		return []Warning{{Code: WarningOptionIgnored, Name: model.Ptr("chave não lida"), Line: model.Ptr(line)}}
	}
	if len(fields) <= mobaSSHKeyField {
		return "", warning()
	}
	key := strings.TrimSpace(fields[mobaSSHKeyField])
	if looksLikeKeyPath(key) {
		key = strings.ReplaceAll(key, "\\", string(filepath.Separator))
		return resolveKeyPath(key, dir), nil
	}
	for index, field := range fields[4:] {
		if index+4 != mobaSSHKeyField && looksLikeKeyPath(strings.TrimSpace(field)) {
			return "", warning()
		}
	}
	return "", nil
}

func looksLikeKeyPath(value string) bool {
	if value == "" {
		return false
	}
	lower := strings.ToLower(value)
	ext := strings.ToLower(filepath.Ext(lower))
	if ext == ".pem" || ext == ".key" || ext == ".ppk" {
		return true
	}
	base := filepath.Base(strings.ReplaceAll(lower, "\\", "/"))
	return strings.HasPrefix(base, "id_rsa") || strings.HasPrefix(base, "id_ed25519") || strings.HasPrefix(base, "id_ecdsa")
}

func mobaGroupPath(value string) []string {
	var path []string
	for _, part := range strings.Split(strings.Trim(value, "\\/"), "\\") {
		if part = strings.TrimSpace(part); part != "" {
			path = append(path, part)
		}
	}
	return path
}

func decodeImportText(raw []byte) (string, error) {
	raw = bytes.TrimPrefix(raw, []byte("\xEF\xBB\xBF"))
	if utf8.Valid(raw) {
		return string(raw), nil
	}
	decoded, err := charmap.Windows1252.NewDecoder().Bytes(raw)
	if err != nil {
		return "", apperr.New(apperr.ImportUnreadable)
	}
	return string(decoded), nil
}

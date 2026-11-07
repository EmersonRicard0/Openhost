package importer

import (
	"bytes"
	"encoding/xml"
	"io"
	"path/filepath"
	"strconv"
	"strings"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

type secureCRTKey struct {
	Name   string
	Keys   []secureCRTKey
	Values map[string]string
}

// UnmarshalXML retains only the non-secret fields needed by the importer.
// In particular Password V2 is skipped by the decoder and never stored.
func (key *secureCRTKey) UnmarshalXML(decoder *xml.Decoder, start xml.StartElement) error {
	key.Values = map[string]string{}
	for _, attribute := range start.Attr {
		if attribute.Name.Local == "name" {
			key.Name = attribute.Value
			break
		}
	}
	for {
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		switch element := token.(type) {
		case xml.StartElement:
			switch element.Name.Local {
			case "key":
				var child secureCRTKey
				if err := decoder.DecodeElement(&child, &element); err != nil {
					return err
				}
				key.Keys = append(key.Keys, child)
			case "string", "dword":
				name := xmlAttribute(element.Attr, "name")
				if !secureCRTFieldAllowed(name) {
					if err := decoder.Skip(); err != nil {
						return err
					}
					continue
				}
				var value string
				if err := decoder.DecodeElement(&value, &element); err != nil {
					return err
				}
				key.Values[name] = strings.TrimSpace(value)
			default:
				if err := decoder.Skip(); err != nil {
					return err
				}
			}
		case xml.EndElement:
			if element.Name == start.Name {
				return nil
			}
		}
	}
}

func LoadSecureCRT(path string, content *model.Content) (*ImportPreview, error) {
	raw, err := readLimited(path)
	if err != nil {
		return nil, err
	}
	defer zero(raw)
	raw = bytes.TrimPrefix(raw, []byte("\xEF\xBB\xBF"))
	decoder := xml.NewDecoder(bytes.NewReader(raw))
	decoder.Strict = true
	keys, err := decodeSecureCRTDocument(decoder)
	if err != nil {
		return nil, apperr.New(apperr.ImportUnreadable)
	}
	sessions := findSecureCRTKey(keys, "Sessions")
	if sessions == nil {
		return nil, apperr.New(apperr.ImportUnreadable)
	}
	source := filepath.Base(path)
	var rows []CandidateRow
	var ignored []IgnoredItem
	count := 0
	walkSecureCRT(sessions.Keys, nil, filepath.Dir(path), &rows, &ignored, &count)
	if count > MaxRows {
		return nil, apperr.New(apperr.ImportTooLarge)
	}
	preview, err := Build(SourceSecureCRT, source, rows, content)
	if err != nil {
		return nil, err
	}
	preview.Ignored = ignored
	if err := preview.ResolveKeys(content); err != nil {
		preview.Zero()
		return nil, err
	}
	return preview, nil
}

func decodeSecureCRTDocument(decoder *xml.Decoder) ([]secureCRTKey, error) {
	var keys []secureCRTKey
	for {
		token, err := decoder.Token()
		if err == io.EOF {
			return keys, nil
		}
		if err != nil {
			return nil, err
		}
		start, ok := token.(xml.StartElement)
		if !ok || start.Name.Local != "key" {
			continue
		}
		var key secureCRTKey
		if err := decoder.DecodeElement(&key, &start); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
}

func findSecureCRTKey(keys []secureCRTKey, name string) *secureCRTKey {
	for index := range keys {
		if strings.EqualFold(keys[index].Name, name) {
			return &keys[index]
		}
		if found := findSecureCRTKey(keys[index].Keys, name); found != nil {
			return found
		}
	}
	return nil
}

func walkSecureCRT(keys []secureCRTKey, groupPath []string, dir string, rows *[]CandidateRow, ignored *[]IgnoredItem, count *int) {
	for index := range keys {
		key := &keys[index]
		protocol, session := key.Values["Protocol Name"]
		if !session {
			next := append(append([]string(nil), groupPath...), key.Name)
			walkSecureCRT(key.Keys, next, dir, rows, ignored, count)
			continue
		}
		*count++
		if !strings.EqualFold(protocol, "SSH2") {
			*ignored = append(*ignored, IgnoredItem{Name: key.Name, Reason: "Protocolo não suportado: " + protocol})
			continue
		}
		port := 22
		portText := key.Values["[SSH2] Port"]
		if portText == "" {
			portText = key.Values["Port"]
		}
		if portText != "" {
			parsed, err := strconv.Atoi(portText)
			if err != nil || parsed == 0 {
				parsed = -1
			}
			port = parsed
		}
		path := append(append([]string(nil), groupPath...), key.Name)
		row := CandidateRow{
			Label:     key.Name,
			Address:   key.Values["Hostname"],
			Port:      port,
			Username:  key.Values["Username"],
			GroupPath: append([]string(nil), groupPath...),
			Origin:    "SecureCRT: " + strings.Join(path, "/"),
		}
		if identity := secureCRTIdentityPath(key.Values["Identity Filename V2"]); identity != "" {
			row.KeyPath = resolveKeyPath(identity, dir)
		}
		*rows = append(*rows, row)
	}
}

func secureCRTIdentityPath(value string) string {
	value = strings.Trim(strings.TrimSpace(value), "\"")
	if value == "" {
		return ""
	}
	start := 0
	if len(value) >= 3 && value[1] == ':' && (value[2] == '\\' || value[2] == '/') {
		start = 2
	}
	if separator := strings.IndexByte(value[start:], ':'); separator >= 0 {
		value = value[:start+separator]
	}
	return strings.TrimSpace(value)
}

func secureCRTFieldAllowed(name string) bool {
	switch name {
	case "Protocol Name", "Hostname", "[SSH2] Port", "Port", "Username", "Identity Filename V2":
		return true
	default:
		return false
	}
}

func xmlAttribute(attributes []xml.Attr, name string) string {
	for _, attribute := range attributes {
		if attribute.Name.Local == name {
			return attribute.Value
		}
	}
	return ""
}

package importer

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

const (
	MaxImportBytes     = 10 * 1024 * 1024
	maxIncludeDepth    = 8
	maxConfigLineBytes = 1024 * 1024
)

type OpenSSHOptions struct {
	HomeDir   string
	LocalUser string
}

type sshDirective struct {
	name, displayName, value, file string
	line                           int
}

type sshBlock struct {
	patterns []string
	options  []sshDirective
}

type sshCandidate struct {
	alias, origin string
}

type openSSHParser struct {
	options         OpenSSHOptions
	sshDir          string
	blocks          []*sshBlock
	current         *sshBlock
	candidates      []sshCandidate
	knownCandidates map[string]bool
	visited         map[string]bool
	ignored         []IgnoredItem
	warnings        []Warning
	totalBytes      int64
	inMatch         bool
}

func LoadOpenSSH(configPath string, options OpenSSHOptions, content *model.Content) (*ImportPreview, error) {
	if strings.TrimSpace(options.HomeDir) == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		options.HomeDir = home
	}
	parser := &openSSHParser{
		options:         options,
		sshDir:          filepath.Join(options.HomeDir, ".ssh"),
		knownCandidates: map[string]bool{},
		visited:         map[string]bool{},
	}
	parser.current = &sshBlock{patterns: []string{"*"}}
	parser.blocks = append(parser.blocks, parser.current)
	if err := parser.parseFile(configPath, 0); err != nil {
		if apperr.CodeOf(err) == apperr.ImportTooLarge {
			return nil, err
		}
		return nil, apperr.New(apperr.ImportUnreadable)
	}
	rows := parser.rows()
	if len(rows) == 0 {
		return nil, apperr.New(apperr.ImportUnreadable)
	}
	preview, err := Build(SourceOpenSSH, filepath.Base(configPath), rows, content)
	if err != nil {
		return nil, err
	}
	preview.Ignored = parser.ignored
	preview.FileWarnings = parser.warnings
	if err := preview.ResolveKeys(content); err != nil {
		preview.Zero()
		return nil, err
	}
	return preview, nil
}

func (p *openSSHParser) parseFile(file string, depth int) error {
	canonical, err := canonicalPath(file)
	if err != nil {
		return err
	}
	key := canonical
	if runtime.GOOS == "windows" {
		key = strings.ToLower(key)
	}
	if p.visited[key] {
		return nil
	}
	p.visited[key] = true
	f, err := os.Open(canonical)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return err
	}
	p.totalBytes += info.Size()
	if info.Size() > MaxImportBytes || p.totalBytes > MaxImportBytes {
		return apperr.New(apperr.ImportTooLarge)
	}

	scanner := bufio.NewScanner(io.LimitReader(f, MaxImportBytes+1))
	scanner.Buffer(make([]byte, 64*1024), maxConfigLineBytes)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		name, displayName, values, ok := parseSSHLine(scanner.Text())
		if !ok {
			continue
		}
		switch name {
		case "host":
			if len(values) == 0 {
				p.addLineWarning(lineNumber)
				continue
			}
			p.inMatch = false
			p.current = &sshBlock{patterns: append([]string{}, values...)}
			p.blocks = append(p.blocks, p.current)
			for _, pattern := range values {
				if isConcreteHost(pattern) {
					candidateKey := strings.ToLower(pattern)
					if !p.knownCandidates[candidateKey] {
						p.knownCandidates[candidateKey] = true
						p.candidates = append(p.candidates, sshCandidate{alias: pattern, origin: fmt.Sprintf("%s:%d", canonical, lineNumber)})
					}
				}
			}
		case "match":
			p.inMatch = true
			p.current = nil
			p.ignored = append(p.ignored, IgnoredItem{Name: "Match", Reason: fmt.Sprintf("%s:%d: bloco não importado", canonical, lineNumber)})
		case "include":
			if p.inMatch {
				continue
			}
			for _, include := range values {
				if err := p.parseInclude(include, lineNumber, depth); err != nil {
					return err
				}
			}
		default:
			if p.inMatch {
				continue
			}
			if p.current == nil {
				p.current = &sshBlock{patterns: []string{"*"}}
				p.blocks = append(p.blocks, p.current)
			}
			p.current.options = append(p.current.options, sshDirective{name: name, displayName: displayName, value: strings.Join(values, " "), file: canonical, line: lineNumber})
		}
	}
	if err := scanner.Err(); err != nil {
		p.addLineWarning(lineNumber + 1)
		return nil
	}
	return nil
}

func (p *openSSHParser) parseInclude(pattern string, line, depth int) error {
	if depth+1 > maxIncludeDepth {
		p.warnings = append(p.warnings, Warning{Code: WarningLineUnreadable, Line: model.Ptr(line)})
		return nil
	}
	pattern = expandHome(pattern, p.options.HomeDir)
	if !filepath.IsAbs(pattern) {
		pattern = filepath.Join(p.sshDir, pattern)
	}
	matches, err := filepath.Glob(pattern)
	if err != nil {
		p.warnings = append(p.warnings, Warning{Code: WarningLineUnreadable, Line: model.Ptr(line)})
		return nil
	}
	sort.Strings(matches)
	for _, match := range matches {
		if err := p.parseFile(match, depth+1); err != nil {
			if apperr.CodeOf(err) == apperr.ImportTooLarge {
				return err
			}
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			p.warnings = append(p.warnings, Warning{Code: WarningLineUnreadable, Line: model.Ptr(line)})
		}
	}
	return nil
}

func (p *openSSHParser) rows() []CandidateRow {
	rows := make([]CandidateRow, 0, len(p.candidates))
	for _, candidate := range p.candidates {
		row := CandidateRow{Label: candidate.alias, Address: candidate.alias, Origin: candidate.origin}
		var gotAddress, gotPort, gotUser, gotKey bool
		for _, block := range p.blocks {
			if !matchesHostBlock(block.patterns, candidate.alias) {
				continue
			}
			for _, option := range block.options {
				switch option.name {
				case "hostname":
					if !gotAddress && option.value != "" {
						row.Address = option.value
						gotAddress = true
					}
				case "port":
					if !gotPort {
						if port, err := strconv.Atoi(strings.TrimSpace(option.value)); err == nil {
							row.Port = port
						} else {
							row.Port = -1
						}
						gotPort = true
					}
				case "user":
					if !gotUser {
						row.Username = option.value
						gotUser = true
					}
				case "identityfile":
					if !gotKey {
						row.KeyPath = option.value
						gotKey = true
					}
				default:
					name := option.displayName
					row.Warnings = append(row.Warnings, Warning{Code: WarningOptionIgnored, Name: &name, Line: model.Ptr(option.line)})
				}
			}
		}
		if row.KeyPath != "" {
			row.KeyPath = p.expandIdentity(row.KeyPath, row.Address, &row)
		}
		rows = append(rows, row)
	}
	return rows
}

func (p *openSSHParser) expandIdentity(value, hostname string, row *CandidateRow) string {
	value = expandHome(value, p.options.HomeDir)
	var out strings.Builder
	for i := 0; i < len(value); i++ {
		if value[i] != '%' {
			out.WriteByte(value[i])
			continue
		}
		if i+1 >= len(value) {
			name := "%"
			row.Warnings = append(row.Warnings, Warning{Code: WarningTokenUnsupported, Name: &name})
			out.WriteByte('%')
			continue
		}
		i++
		token := value[i]
		switch token {
		case '%':
			out.WriteByte('%')
		case 'h':
			out.WriteString(hostname)
		case 'u':
			out.WriteString(p.options.LocalUser)
		case 'd':
			out.WriteString(p.options.HomeDir)
		default:
			name := "%" + string(token)
			row.Warnings = append(row.Warnings, Warning{Code: WarningTokenUnsupported, Name: &name})
			out.WriteString(name)
		}
	}
	result := out.String()
	if !filepath.IsAbs(result) {
		result = filepath.Join(p.options.HomeDir, result)
	}
	return filepath.Clean(result)
}

func (p *openSSHParser) addLineWarning(line int) {
	p.warnings = append(p.warnings, Warning{Code: WarningLineUnreadable, Line: model.Ptr(line)})
}

func canonicalPath(value string) (string, error) {
	absolute, err := filepath.Abs(filepath.Clean(value))
	if err != nil {
		return "", err
	}
	if resolved, resolveErr := filepath.EvalSymlinks(absolute); resolveErr == nil {
		absolute = resolved
	}
	return absolute, nil
}
func expandHome(value, home string) string {
	if value == "~" {
		return home
	}
	if strings.HasPrefix(value, "~/") || strings.HasPrefix(value, "~\\") {
		return filepath.Join(home, value[2:])
	}
	return value
}
func isConcreteHost(pattern string) bool {
	return pattern != "" && !strings.HasPrefix(pattern, "!") && !strings.ContainsAny(pattern, "*?")
}

func matchesHostBlock(patterns []string, host string) bool {
	positive := false
	for _, pattern := range patterns {
		negated := strings.HasPrefix(pattern, "!")
		if negated {
			pattern = strings.TrimPrefix(pattern, "!")
		}
		matched, err := path.Match(strings.ToLower(pattern), strings.ToLower(host))
		if err != nil {
			continue
		}
		if matched && negated {
			return false
		}
		if matched {
			positive = true
		}
	}
	return positive
}

func parseSSHLine(line string) (name, displayName string, values []string, ok bool) {
	clean := stripSSHComment(strings.TrimSpace(line))
	if clean == "" {
		return "", "", nil, false
	}
	key, rest := splitSSHKey(clean)
	if key == "" {
		return "", "", nil, false
	}
	values, valid := splitSSHWords(rest)
	if !valid {
		return strings.ToLower(key), key, nil, false
	}
	return strings.ToLower(key), key, values, true
}

func splitSSHKey(line string) (string, string) {
	for i, r := range line {
		if r == '=' {
			return strings.TrimSpace(line[:i]), strings.TrimSpace(line[i+1:])
		}
		if unicode.IsSpace(r) {
			return line[:i], strings.TrimSpace(line[i:])
		}
	}
	return line, ""
}

func stripSSHComment(line string) string {
	quote := rune(0)
	escaped := false
	for i, r := range line {
		if escaped {
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
			}
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			continue
		}
		if r == '#' {
			return strings.TrimSpace(line[:i])
		}
	}
	return strings.TrimSpace(line)
}

func splitSSHWords(value string) ([]string, bool) {
	var words []string
	var current strings.Builder
	quote := rune(0)
	escaped := false
	started := false
	flush := func() {
		if started {
			words = append(words, current.String())
			current.Reset()
			started = false
		}
	}
	runes := []rune(value)
	for i, r := range runes {
		if escaped {
			current.WriteRune(r)
			started = true
			escaped = false
			continue
		}
		if r == '\\' {
			if i+1 < len(runes) && (unicode.IsSpace(runes[i+1]) || runes[i+1] == '\\' || runes[i+1] == '"' || runes[i+1] == '\'' || runes[i+1] == '#') {
				escaped = true
			} else {
				current.WriteRune(r)
				started = true
			}
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
				started = true
			} else {
				current.WriteRune(r)
				started = true
			}
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			started = true
			continue
		}
		if unicode.IsSpace(r) {
			flush()
			continue
		}
		current.WriteRune(r)
		started = true
	}
	if escaped {
		current.WriteRune('\\')
	}
	if quote != 0 {
		return nil, false
	}
	flush()
	return words, true
}

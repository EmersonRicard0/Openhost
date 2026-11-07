package importer

import (
	"bytes"
	"encoding/csv"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/charmap"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

// CSVFields são as colunas do modelo, na ordem do arquivo de exemplo (FR-313).
var CSVFields = []string{"nome", "endereco", "porta", "usuario", "grupo", "chave"}

// csvSynonyms casa o cabeçalho normalizado (minúsculas, sem acento nem espaço) com o campo (R7).
var csvSynonyms = map[string]string{
	"nome": "nome", "label": "nome", "rotulo": "nome", "name": "nome",
	"endereco": "endereco", "host": "endereco", "hostname": "endereco", "ip": "endereco", "address": "endereco",
	"porta": "porta", "port": "porta",
	"usuario": "usuario", "user": "usuario", "username": "usuario", "login": "usuario",
	"grupo": "grupo", "group": "grupo", "pasta": "grupo", "folder": "grupo",
	"chave": "chave", "key": "chave", "identityfile": "chave",
}

// csvSource guarda a planilha já lida para RemapCsv reinterpretar sem abrir o arquivo de novo.
type csvSource struct {
	name    string
	dir     string
	columns []string
	records [][]string
	lines   []int
}

// CSVTemplate é o modelo oferecido para download (FR-314): UTF-8 com BOM, ";" e uma linha de
// exemplo com endereço da faixa de documentação.
func CSVTemplate() []byte {
	return []byte("\xEF\xBB\xBF" + strings.Join(CSVFields, ";") + "\r\n" +
		"Servidor de exemplo;192.0.2.10;22;usuario;Clientes/Norte;\r\n")
}

// LoadCSV lê a planilha e monta a prévia. Sem mapping, as colunas são reconhecidas pelo
// cabeçalho; sem coluna de endereço, a prévia volta vazia com NeedsMapping (FR-313).
func LoadCSV(path string, mapping map[string]*int, content *model.Content) (*ImportPreview, error) {
	raw, err := readLimited(path)
	if err != nil {
		return nil, err
	}
	src, err := parseCSV(raw)
	if err != nil {
		return nil, err
	}
	src.name, src.dir = filepath.Base(path), filepath.Dir(path)
	if mapping == nil {
		mapping = guessMapping(src.columns)
	}
	return buildCSV(src, mapping, content)
}

// RemapCSV refaz a prévia de p com outro mapeamento de colunas.
func RemapCSV(p *ImportPreview, mapping map[string]*int, content *model.Content) (*ImportPreview, error) {
	if p == nil || p.csv == nil {
		return nil, apperr.New(apperr.InvalidInput)
	}
	return buildCSV(p.csv, mapping, content)
}

func readLimited(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, MaxImportBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > MaxImportBytes {
		return nil, apperr.New(apperr.ImportTooLarge)
	}
	return raw, nil
}

// parseCSV tira o BOM, decodifica Windows-1252 quando o texto não é UTF-8 válido, detecta o
// separador e devolve cabeçalho e linhas com o número da linha no arquivo.
func parseCSV(raw []byte) (*csvSource, error) {
	raw = bytes.TrimPrefix(raw, []byte("\xEF\xBB\xBF"))
	if !utf8.Valid(raw) {
		decoded, err := charmap.Windows1252.NewDecoder().Bytes(raw)
		if err != nil {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		raw = decoded
	}
	r := csv.NewReader(bytes.NewReader(raw))
	r.Comma = detectSeparator(raw)
	r.LazyQuotes = true
	r.FieldsPerRecord = -1
	src := &csvSource{}
	for {
		record, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, apperr.New(apperr.ImportUnreadable)
		}
		if blank(record) {
			continue
		}
		line, _ := r.FieldPos(0)
		if src.columns == nil {
			src.columns = trimAll(record)
			continue
		}
		if len(src.records) == MaxRows {
			return nil, apperr.New(apperr.ImportTooLarge)
		}
		src.records = append(src.records, record)
		src.lines = append(src.lines, line)
	}
	if len(src.records) == 0 {
		return nil, apperr.New(apperr.ImportUnreadable)
	}
	return src, nil
}

// detectSeparator conta ",", ";" e tab fora de aspas nas 5 primeiras linhas (R7).
func detectSeparator(raw []byte) rune {
	counts := map[rune]int{}
	quoted, lines := false, 0
	for _, r := range string(raw) {
		switch {
		case r == '"':
			quoted = !quoted
		case quoted:
		case r == '\n':
			lines++
		case r == ',' || r == ';' || r == '\t':
			counts[r]++
		}
		if lines == 5 {
			break
		}
	}
	best := ','
	for _, sep := range []rune{';', '\t'} {
		if counts[sep] > counts[best] {
			best = sep
		}
	}
	return best
}

func guessMapping(columns []string) map[string]*int {
	mapping := map[string]*int{}
	for i, column := range columns {
		field, ok := csvSynonyms[normalizeHeader(column)]
		if ok && mapping[field] == nil {
			mapping[field] = model.Ptr(i)
		}
	}
	return mapping
}

func buildCSV(src *csvSource, mapping map[string]*int, content *model.Content) (*ImportPreview, error) {
	full := make(map[string]*int, len(CSVFields))
	for _, field := range CSVFields {
		full[field] = nil
	}
	for field, index := range mapping {
		if _, known := full[field]; !known {
			return nil, apperr.New(apperr.InvalidInput)
		}
		if index != nil && (*index < 0 || *index >= len(src.columns)) {
			return nil, apperr.New(apperr.InvalidInput)
		}
		full[field] = index
	}
	state := &CsvPreview{Columns: append([]string{}, src.columns...), Mapping: full, NeedsMapping: full["endereco"] == nil}
	var rows []CandidateRow
	if !state.NeedsMapping {
		rows = make([]CandidateRow, 0, len(src.records))
		for i, record := range src.records {
			rows = append(rows, csvRow(src, full, record, src.lines[i]))
		}
	}
	p, err := Build(SourceCSV, src.name, rows, content)
	if err != nil {
		return nil, err
	}
	p.CSV, p.csv = state, src
	if err := p.ResolveKeys(content); err != nil {
		p.Zero()
		return nil, err
	}
	return p, nil
}

func csvRow(src *csvSource, mapping map[string]*int, record []string, line int) CandidateRow {
	get := func(field string) string {
		index := mapping[field]
		if index == nil || *index >= len(record) {
			return ""
		}
		return strings.TrimSpace(record[*index])
	}
	row := CandidateRow{
		Label: get("nome"), Address: get("endereco"), Username: get("usuario"),
		Origin: src.name + ":" + strconv.Itoa(line),
	}
	if port := get("porta"); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n == 0 {
			n = -1 // fica inválida na prévia, com INVALID_PORT
		}
		row.Port = n
	}
	for _, part := range strings.Split(get("grupo"), "/") {
		if part = strings.TrimSpace(part); part != "" {
			row.GroupPath = append(row.GroupPath, part)
		}
	}
	if key := get("chave"); key != "" {
		row.KeyPath = resolveKeyPath(key, src.dir)
	}
	return row
}

// resolveKeyPath expande "~" e procura caminhos relativos ao lado da planilha.
func resolveKeyPath(key, dir string) string {
	if key == "~" || strings.HasPrefix(key, "~/") || strings.HasPrefix(key, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return filepath.Join(home, key[1:])
		}
	}
	if filepath.IsAbs(key) {
		return filepath.Clean(key)
	}
	return filepath.Join(dir, key)
}

func normalizeHeader(header string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(header)) {
		switch r {
		case ' ', '_', '-', '.':
			continue
		case 'á', 'à', 'â', 'ã', 'ä':
			r = 'a'
		case 'é', 'è', 'ê', 'ë':
			r = 'e'
		case 'í', 'ì', 'î', 'ï':
			r = 'i'
		case 'ó', 'ò', 'ô', 'õ', 'ö':
			r = 'o'
		case 'ú', 'ù', 'û', 'ü':
			r = 'u'
		case 'ç':
			r = 'c'
		}
		b.WriteRune(r)
	}
	return b.String()
}

func blank(record []string) bool {
	for _, field := range record {
		if strings.TrimSpace(field) != "" {
			return false
		}
	}
	return true
}

func trimAll(record []string) []string {
	out := make([]string, len(record))
	for i, field := range record {
		out[i] = strings.TrimSpace(field)
	}
	return out
}

package domain

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

const MaxSnippets = 500

var snippetFieldName = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)

type SnippetInput struct {
	Name    string   `json:"name"`
	Text    string   `json:"text"`
	Tags    []string `json:"tags"`
	Execute bool     `json:"execute"`

	nameSet    bool
	textSet    bool
	tagsSet    bool
	executeSet bool
}

func (in *SnippetInput) UnmarshalJSON(data []byte) error {
	type plain SnippetInput
	var decoded plain
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*in = SnippetInput(decoded)
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	_, in.nameSet = fields["name"]
	_, in.textSet = fields["text"]
	_, in.tagsSet = fields["tags"]
	_, in.executeSet = fields["execute"]
	return nil
}

// SnippetFields devolve os campos válidos na ordem da primeira ocorrência. Chaves duplicadas
// são literais e nunca deixam um trecho interno virar campo.
func SnippetFields(text string) []string {
	fields := make([]string, 0)
	seen := map[string]struct{}{}
	for i := 0; i < len(text); {
		if i+1 < len(text) && (text[i:i+2] == "{{" || text[i:i+2] == "}}") {
			i += 2
			continue
		}
		if text[i] != '{' {
			i++
			continue
		}
		end := strings.IndexByte(text[i+1:], '}')
		if end < 0 {
			break
		}
		end += i + 1
		name := text[i+1 : end]
		if snippetFieldName.MatchString(name) {
			if _, exists := seen[name]; !exists {
				seen[name] = struct{}{}
				fields = append(fields, name)
			}
			i = end + 1
			continue
		}
		i++
	}
	return fields
}

func normalizeSnippetInput(in SnippetInput) (SnippetInput, error) {
	in.Name = strings.TrimSpace(in.Name)
	if count := utf8.RuneCountInString(in.Name); count < 1 || count > 64 || snippetControl(in.Name) {
		return in, invalidField("name")
	}
	in.Text = strings.ReplaceAll(in.Text, "\r\n", "\n")
	if count := utf8.RuneCountInString(in.Text); count < 1 || count > 4000 {
		return in, invalidField("text")
	}
	for _, r := range in.Text {
		if unicode.IsControl(r) && r != '\n' {
			return in, invalidField("text")
		}
	}
	if len(SnippetFields(in.Text)) > 10 {
		return in, invalidField("text")
	}
	tags, err := NormalizeHostMetadata(in.Tags, "")
	if err != nil {
		return in, invalidField("tags")
	}
	in.Tags = tags
	return in, nil
}

func snippetControl(value string) bool {
	for _, r := range value {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}

func snippetIndex(c *model.Content, id string) int {
	for i := range c.Snippets {
		if c.Snippets[i].ID == id {
			return i
		}
	}
	return -1
}

func snippetNameTaken(c *model.Content, exceptID, name string) bool {
	for _, snippet := range c.Snippets {
		if snippet.ID != exceptID && strings.EqualFold(snippet.Name, name) {
			return true
		}
	}
	return false
}

// ValidateSnippet normaliza e valida uma entidade recebida de uma fonte externa antes de ela
// entrar no conteúdo do cofre. O chamador continua responsável por validar id e datas.
func ValidateSnippet(c *model.Content, snippet model.Snippet) (model.Snippet, error) {
	if len(c.Snippets) >= MaxSnippets {
		return model.Snippet{}, invalidField("snippets")
	}
	validated, err := normalizeSnippetInput(SnippetInput{
		Name: snippet.Name, Text: snippet.Text, Tags: snippet.Tags, Execute: snippet.Execute,
	})
	if err != nil {
		return model.Snippet{}, err
	}
	if snippetNameTaken(c, snippet.ID, validated.Name) {
		return model.Snippet{}, apperr.New(apperr.AlreadyExists)
	}
	snippet.Name, snippet.Text, snippet.Tags = validated.Name, validated.Text, validated.Tags
	return snippet, nil
}

func duplicateSnippetName(c *model.Content, base string) string {
	for number := 2; ; number++ {
		suffix := fmt.Sprintf(" (%d)", number)
		runes := []rune(base)
		if limit := 64 - len([]rune(suffix)); len(runes) > limit {
			runes = runes[:limit]
		}
		candidate := string(runes) + suffix
		if !snippetNameTaken(c, "", candidate) {
			return candidate
		}
	}
}

func UniqueSnippetName(c *model.Content, base string) string {
	if !snippetNameTaken(c, "", base) {
		return base
	}
	return duplicateSnippetName(c, base)
}

func CreateSnippet(c *model.Content, in SnippetInput, now string) (model.Snippet, error) {
	if len(c.Snippets) >= MaxSnippets {
		return model.Snippet{}, invalidField("snippets")
	}
	validated, err := normalizeSnippetInput(in)
	if err != nil {
		return model.Snippet{}, err
	}
	if snippetNameTaken(c, "", validated.Name) {
		return model.Snippet{}, apperr.New(apperr.AlreadyExists)
	}
	snippet := model.Snippet{
		ID: NewID(), Name: validated.Name, Text: validated.Text, Tags: validated.Tags,
		Execute: validated.Execute, CreatedAt: now, UpdatedAt: now,
	}
	c.Snippets = append(c.Snippets, snippet)
	return snippet, nil
}

func UpdateSnippet(c *model.Content, id string, in SnippetInput, now string) (model.Snippet, error) {
	i := snippetIndex(c, id)
	if i < 0 {
		return model.Snippet{}, notFound()
	}
	current := c.Snippets[i]
	if !in.nameSet && in.Name == "" {
		in.Name = current.Name
	}
	if !in.textSet && in.Text == "" {
		in.Text = current.Text
	}
	if !in.tagsSet && in.Tags == nil {
		in.Tags = append([]string{}, current.Tags...)
	}
	if !in.executeSet && !in.Execute {
		in.Execute = current.Execute
	}
	validated, err := normalizeSnippetInput(in)
	if err != nil {
		return model.Snippet{}, err
	}
	if snippetNameTaken(c, id, validated.Name) {
		return model.Snippet{}, apperr.New(apperr.AlreadyExists)
	}
	updated := model.Snippet{
		ID: id, Name: validated.Name, Text: validated.Text, Tags: validated.Tags,
		Execute: validated.Execute, CreatedAt: current.CreatedAt, UpdatedAt: now,
	}
	c.Snippets[i] = updated
	return updated, nil
}

func RemoveSnippet(c *model.Content, id string) error {
	i := snippetIndex(c, id)
	if i < 0 {
		return notFound()
	}
	c.Snippets = append(c.Snippets[:i], c.Snippets[i+1:]...)
	return nil
}

func DuplicateSnippet(c *model.Content, id, now string) (model.Snippet, error) {
	i := snippetIndex(c, id)
	if i < 0 {
		return model.Snippet{}, notFound()
	}
	if len(c.Snippets) >= MaxSnippets {
		return model.Snippet{}, invalidField("snippets")
	}
	copy := c.Snippets[i]
	copy.ID, copy.Name = NewID(), duplicateSnippetName(c, copy.Name)
	copy.Tags = append([]string{}, copy.Tags...)
	copy.CreatedAt, copy.UpdatedAt = now, now
	c.Snippets = append(c.Snippets, copy)
	return copy, nil
}

func ListSnippets(c *model.Content) []model.Snippet {
	out := append([]model.Snippet{}, c.Snippets...)
	for i := range out {
		out[i].Tags = append([]string{}, out[i].Tags...)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out
}

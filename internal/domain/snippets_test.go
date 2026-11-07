package domain

import (
	"encoding/json"
	"os"
	"reflect"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

func TestSnippetFieldsSharedCases(t *testing.T) {
	raw, err := os.ReadFile("testdata/snippet_fields.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Text   string   `json:"text"`
		Fields []string `json:"fields"`
	}
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		if got := SnippetFields(tc.Text); !reflect.DeepEqual(got, tc.Fields) {
			t.Errorf("SnippetFields(%q) = %v, want %v", tc.Text, got, tc.Fields)
		}
	}
}

func TestSnippetLifecycleAndPartialUpdate(t *testing.T) {
	c := model.EmptyContent()
	created, err := CreateSnippet(c, SnippetInput{
		Name: "  Interfaces  ", Text: "show interface\r\nbrief", Tags: []string{" Huawei ", "OLT"},
	}, t0)
	if err != nil {
		t.Fatal(err)
	}
	if created.Name != "Interfaces" || created.Text != "show interface\nbrief" ||
		!reflect.DeepEqual(created.Tags, []string{"Huawei", "OLT"}) || created.Execute ||
		created.CreatedAt != t0 || created.UpdatedAt != t0 {
		t.Fatalf("created = %+v", created)
	}

	var patch SnippetInput
	if err := json.Unmarshal([]byte(`{"execute":true}`), &patch); err != nil {
		t.Fatal(err)
	}
	updated, err := UpdateSnippet(c, created.ID, patch, t1)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != created.Name || updated.Text != created.Text ||
		!reflect.DeepEqual(updated.Tags, created.Tags) || !updated.Execute || updated.UpdatedAt != t1 {
		t.Fatalf("partial update = %+v", updated)
	}

	copy, err := DuplicateSnippet(c, created.ID, t1)
	if err != nil || copy.Name != "Interfaces (2)" || copy.ID == created.ID {
		t.Fatalf("duplicate = %+v, %v", copy, err)
	}
	copy2, err := DuplicateSnippet(c, created.ID, t1)
	if err != nil || copy2.Name != "Interfaces (3)" {
		t.Fatalf("second duplicate = %+v, %v", copy2, err)
	}
	if err := RemoveSnippet(c, created.ID); err != nil {
		t.Fatal(err)
	}
	wantCode(t, RemoveSnippet(c, created.ID), apperr.NotFound)
}

func TestSnippetValidationDoesNotLeakText(t *testing.T) {
	cases := []struct {
		name  string
		input SnippetInput
		field string
	}{
		{"name empty", SnippetInput{Name: " ", Text: "ok"}, "name"},
		{"name long", SnippetInput{Name: strings.Repeat("n", 65), Text: "ok"}, "name"},
		{"text empty", SnippetInput{Name: "x", Text: ""}, "text"},
		{"text long", SnippetInput{Name: "x", Text: strings.Repeat("x", 4001)}, "text"},
		{"control", SnippetInput{Name: "x", Text: "segredo\tnao-vazar"}, "text"},
		{"tags", SnippetInput{Name: "x", Text: "ok", Tags: []string{"a", "A"}}, "tags"},
		{"fields", SnippetInput{Name: "x", Text: "{a}{b}{c}{d}{e}{f}{g}{h}{i}{j}{k}"}, "text"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := CreateSnippet(model.EmptyContent(), tc.input, t0)
			wantCode(t, err, apperr.InvalidInput)
			var appErr *apperr.Error
			if !strings.Contains(err.Error(), "field: "+tc.field) {
				t.Fatalf("detail = %v", err)
			}
			_ = appErr
			if strings.Contains(err.Error(), "segredo") {
				t.Fatalf("erro vazou texto: %v", err)
			}
		})
	}

	c := model.EmptyContent()
	if _, err := CreateSnippet(c, SnippetInput{Name: "Nome", Text: "ok"}, t0); err != nil {
		t.Fatal(err)
	}
	_, err := CreateSnippet(c, SnippetInput{Name: " nome ", Text: "outro"}, t0)
	wantCode(t, err, apperr.AlreadyExists)
}

func TestSnippetLimit(t *testing.T) {
	c := model.EmptyContent()
	for i := 0; i < MaxSnippets; i++ {
		c.Snippets = append(c.Snippets, model.Snippet{ID: NewID(), Name: string(rune(0x1000 + i))})
	}
	_, err := CreateSnippet(c, SnippetInput{Name: "mais um", Text: "show"}, t0)
	wantCode(t, err, apperr.InvalidInput)
	if !strings.Contains(err.Error(), "field: snippets") {
		t.Fatalf("limit error = %v", err)
	}
}

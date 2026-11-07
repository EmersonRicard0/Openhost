package bridge

import (
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/validate"
	"shellvault/internal/vault"
)

const EventSnippetsChanged = "snippets:changed"

type SnippetService struct {
	store *vault.Store
	emit  func(string, any)
}

func newSnippetService(store *vault.Store, emit func(string, any)) *SnippetService {
	return &SnippetService{store: store, emit: emit}
}

func (s *SnippetService) changed() {
	if s.emit != nil {
		s.emit(EventSnippetsChanged, nil)
	}
}

func (s *SnippetService) List() ([]model.Snippet, error) {
	content, err := s.store.Read()
	if err != nil {
		return nil, clean(err)
	}
	return domain.ListSnippets(content), nil
}

func (s *SnippetService) Create(input domain.SnippetInput) (model.Snippet, error) {
	var created model.Snippet
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		created, err = domain.CreateSnippet(content, input, domain.Now())
		return err
	})
	if err != nil {
		return model.Snippet{}, clean(err)
	}
	s.changed()
	return created, nil
}

func (s *SnippetService) Update(id string, input domain.SnippetInput) (model.Snippet, error) {
	if err := validate.UUID(id); err != nil {
		return model.Snippet{}, clean(err)
	}
	var updated model.Snippet
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		updated, err = domain.UpdateSnippet(content, id, input, domain.Now())
		return err
	})
	if err != nil {
		return model.Snippet{}, clean(err)
	}
	s.changed()
	return updated, nil
}

func (s *SnippetService) Remove(id string) error {
	if err := validate.UUID(id); err != nil {
		return clean(err)
	}
	if err := s.store.Mutate(func(content *model.Content) error {
		return domain.RemoveSnippet(content, id)
	}); err != nil {
		return clean(err)
	}
	s.changed()
	return nil
}

func (s *SnippetService) Duplicate(id string) (model.Snippet, error) {
	if err := validate.UUID(id); err != nil {
		return model.Snippet{}, clean(err)
	}
	var duplicate model.Snippet
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		duplicate, err = domain.DuplicateSnippet(content, id, domain.Now())
		return err
	})
	if err != nil {
		return model.Snippet{}, clean(err)
	}
	s.changed()
	return duplicate, nil
}

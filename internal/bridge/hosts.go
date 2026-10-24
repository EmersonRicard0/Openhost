package bridge

import (
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/validate"
	"shellvault/internal/vault"
)

type HostService struct {
	store *vault.Store
}

func newHostService(store *vault.Store) *HostService {
	return &HostService{store: store}
}

func (s *HostService) List() ([]domain.HostView, error) {
	content, err := s.store.Read()
	if err != nil {
		return nil, clean(err)
	}
	return domain.ListHostViews(content), nil
}

func (s *HostService) Create(input domain.HostInput) (domain.HostView, error) {
	var created model.Host
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		created, err = domain.CreateHost(content, input, domain.Now())
		return err
	})
	if err != nil {
		return domain.HostView{}, clean(err)
	}
	content, err := s.store.Read()
	if err != nil {
		return domain.HostView{}, clean(err)
	}
	return domain.ToHostView(content, created), nil
}

func (s *HostService) Update(id string, input domain.HostInput) (domain.HostView, error) {
	if err := validate.UUID(id); err != nil {
		return domain.HostView{}, clean(err)
	}
	var updated model.Host
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		updated, err = domain.UpdateHost(content, id, input, domain.Now())
		return err
	})
	if err != nil {
		return domain.HostView{}, clean(err)
	}
	content, err := s.store.Read()
	if err != nil {
		return domain.HostView{}, clean(err)
	}
	return domain.ToHostView(content, updated), nil
}

func (s *HostService) Duplicate(id string) (domain.HostView, error) {
	if err := validate.UUID(id); err != nil {
		return domain.HostView{}, clean(err)
	}
	var duplicate model.Host
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		duplicate, err = domain.DuplicateHost(content, id, domain.Now())
		return err
	})
	if err != nil {
		return domain.HostView{}, clean(err)
	}
	content, err := s.store.Read()
	if err != nil {
		return domain.HostView{}, clean(err)
	}
	return domain.ToHostView(content, duplicate), nil
}

func (s *HostService) Remove(id string) error {
	if err := validate.UUID(id); err != nil {
		return clean(err)
	}
	return clean(s.store.Mutate(func(content *model.Content) error {
		return domain.RemoveHost(content, id)
	}))
}

func (s *HostService) Move(id string, groupID *string) error {
	if err := validate.UUID(id); err != nil {
		return clean(err)
	}
	if err := validate.OptionalUUID(groupID); err != nil {
		return clean(err)
	}
	return clean(s.store.Mutate(func(content *model.Content) error {
		return domain.MoveHost(content, id, groupID, domain.Now())
	}))
}

func (s *HostService) ListGroups() ([]model.Group, error) {
	content, err := s.store.Read()
	if err != nil {
		return nil, clean(err)
	}
	return domain.ListGroups(content), nil
}

func (s *HostService) CreateGroup(name string, parentID *string) (model.Group, error) {
	if err := validate.OptionalUUID(parentID); err != nil {
		return model.Group{}, clean(err)
	}
	var created model.Group
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		created, err = domain.CreateGroup(content, name, parentID)
		return err
	})
	return created, clean(err)
}

func (s *HostService) RenameGroup(id, name string) (model.Group, error) {
	if err := validate.UUID(id); err != nil {
		return model.Group{}, clean(err)
	}
	var renamed model.Group
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		renamed, err = domain.RenameGroup(content, id, name)
		return err
	})
	return renamed, clean(err)
}

func (s *HostService) MoveGroup(id string, parentID *string) error {
	if err := validate.UUID(id); err != nil {
		return clean(err)
	}
	if err := validate.OptionalUUID(parentID); err != nil {
		return clean(err)
	}
	return clean(s.store.Mutate(func(content *model.Content) error {
		return domain.MoveGroup(content, id, parentID)
	}))
}

func (s *HostService) RemoveGroup(id string) error {
	if err := validate.UUID(id); err != nil {
		return clean(err)
	}
	return clean(s.store.Mutate(func(content *model.Content) error {
		return domain.RemoveGroup(content, id)
	}))
}

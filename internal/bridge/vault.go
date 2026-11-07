package bridge

import (
	"encoding/json"
	"math"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
	"shellvault/internal/validate"
	"shellvault/internal/vault"
	"shellvault/internal/vault/migrate001"
)

const erasePhrase = "APAGAR"

type VaultSettingsPatch map[string]any

type VaultService struct {
	store          *vault.Store
	autoLock       *vault.AutoLock
	changePassword func(string, string, string) error
}

func newVaultService(store *vault.Store, autoLock *vault.AutoLock) *VaultService {
	return &VaultService{store: store, autoLock: autoLock, changePassword: store.ChangePassword}
}

func (s *VaultService) GetStatus() (vault.Status, error) {
	return s.store.Status(), nil
}

func (s *VaultService) Create(password, confirmation string) error {
	return clean(s.store.Create(password, confirmation))
}

func (s *VaultService) Unlock(password string) error {
	if s.store.Status().State == vault.StateMigratable {
		return clean(migrate001.Migrate(s.store, password))
	}
	return clean(s.store.Unlock(password))
}

func (s *VaultService) Lock() error {
	s.store.Lock()
	return nil
}

func (s *VaultService) ChangePassword(current, next, confirmation string) error {
	return clean(s.changePassword(current, next, confirmation))
}

func (s *VaultService) Erase(confirmPhrase string) error {
	if confirmPhrase != erasePhrase {
		return apperr.New(apperr.InvalidInput)
	}
	return clean(s.store.Erase())
}

func (s *VaultService) GetSettings() (model.VaultSettings, error) {
	content, err := s.store.Read()
	if err != nil {
		return model.VaultSettings{}, clean(err)
	}
	return content.Settings, nil
}

func (s *VaultService) UpdateSettings(patch VaultSettingsPatch) (model.VaultSettings, error) {
	if patch == nil {
		return model.VaultSettings{}, apperr.New(apperr.InvalidInput)
	}
	var updated model.VaultSettings
	err := s.store.Mutate(func(content *model.Content) error {
		next := content.Settings
		for key, raw := range patch {
			switch key {
			case "environments":
				encoded, err := json.Marshal(raw)
				if err != nil {
					return invalidPreference("field: environments")
				}
				var environments []model.Environment
				if err := json.Unmarshal(encoded, &environments); err != nil || environments == nil {
					return invalidPreference("field: environments")
				}
				for i := range environments {
					if environments[i].ID == "" {
						environments[i].ID = domain.NewID()
					}
				}
				environments, err = domain.ValidateEnvironments(environments)
				if err != nil {
					return err
				}
				next.Environments = environments
			case "autoLockMinutes":
				if raw == nil {
					next.AutoLockMinutes = nil
					continue
				}
				value, ok := bridgeInt(raw)
				if !ok || validate.Int(value, 1, 120) != nil {
					return apperr.New(apperr.InvalidInput)
				}
				next.AutoLockMinutes = model.Ptr(value)
			case "connectTimeoutSeconds":
				value, ok := bridgeInt(raw)
				if !ok || validate.Int(value, 5, 120) != nil {
					return apperr.New(apperr.InvalidInput)
				}
				next.ConnectTimeoutSeconds = value
			case "keepaliveSeconds":
				value, ok := bridgeInt(raw)
				if !ok || validate.Int(value, 10, 300) != nil {
					return apperr.New(apperr.InvalidInput)
				}
				next.KeepaliveSeconds = value
			case "legacyDefault":
				value, ok := raw.(bool)
				if !ok {
					return apperr.New(apperr.InvalidInput)
				}
				next.LegacyDefault = value
			case "term":
				value, ok := raw.(string)
				if !ok || !model.ValidTerm(value) {
					return apperr.New(apperr.InvalidInput)
				}
				next.Term = value
			default:
				return apperr.New(apperr.InvalidInput)
			}
		}
		content.Settings = next
		updated = next
		return nil
	})
	if err != nil {
		return model.VaultSettings{}, clean(err)
	}
	s.autoLock.Reconfigure()
	return updated, nil
}

func (s *VaultService) ReportActivity() error {
	s.autoLock.ReportActivity()
	return nil
}

func bridgeInt(value any) (int, bool) {
	switch number := value.(type) {
	case int:
		return number, true
	case int32:
		return int(number), true
	case int64:
		return int(number), int64(int(number)) == number
	case float64:
		if math.Trunc(number) == number && number >= -1<<31 && number <= 1<<31-1 {
			return int(number), true
		}
	case json.Number:
		parsed, err := number.Int64()
		if err == nil && int64(int(parsed)) == parsed {
			return int(parsed), true
		}
	}
	return 0, false
}

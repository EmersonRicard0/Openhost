package exporter

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"shellvault/internal/model"
	"shellvault/internal/vault"
)

const (
	Format  = "openhost-export"
	Version = 2
)

type OpenHostKDF struct {
	Alg       string `json:"alg"`
	Time      uint32 `json:"time"`
	MemoryKiB uint32 `json:"memoryKiB"`
	Salt      string `json:"salt"`
}

type OpenHostHost struct {
	ID               string                 `json:"id"`
	Label            string                 `json:"label"`
	Address          string                 `json:"address"`
	Port             int                    `json:"port"`
	Username         string                 `json:"username"`
	AuthMethod       model.AuthMethod       `json:"authMethod"`
	KeyID            *string                `json:"keyId"`
	GroupID          *string                `json:"groupId"`
	Tags             []string               `json:"tags"`
	Notes            string                 `json:"notes"`
	Environment      *OpenHostEnvironment   `json:"environment"`
	LegacyAlgorithms bool                   `json:"legacyAlgorithms"`
	OSIcon           string                 `json:"osIcon"`
	Profile          *model.TerminalProfile `json:"profile"`
}

type OpenHostEnvironment struct {
	Name  string                 `json:"name"`
	Color model.EnvironmentColor `json:"color"`
}

type OpenHostForwardRule struct {
	HostID           string  `json:"hostId"`
	Label            *string `json:"label"`
	BindAddress      string  `json:"bindAddress"`
	AllowNonLoopback bool    `json:"allowNonLoopback"`
	BindPort         int     `json:"bindPort"`
	DestHost         string  `json:"destHost"`
	DestPort         int     `json:"destPort"`
}

type OpenHostKey struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	PrivateKey string  `json:"privateKey"`
	Passphrase *string `json:"passphrase"`
}

type OpenHostData struct {
	Groups       []model.Group         `json:"groups"`
	Hosts        []OpenHostHost        `json:"hosts"`
	ForwardRules []OpenHostForwardRule `json:"forwardRules"`
	Keys         []OpenHostKey         `json:"keys,omitempty"`
}

type OpenHostFile struct {
	Format     string        `json:"format"`
	Version    int           `json:"version"`
	ExportedAt string        `json:"exportedAt,omitempty"`
	App        string        `json:"app,omitempty"`
	Encrypted  bool          `json:"encrypted"`
	KDF        *OpenHostKDF  `json:"kdf,omitempty"`
	Data       *OpenHostData `json:"data,omitempty"`
	Payload    string        `json:"payload,omitempty"`
}

type OpenHostOptions struct {
	Profiles     map[string]*model.TerminalProfile
	IncludeKeys  bool
	FilePassword string
	KDF          func([]byte) vault.KDFParams
	Now          func() time.Time
	AppVersion   string
}

func OpenHostAD(format string, version int, kdf OpenHostKDF) []byte {
	return []byte(fmt.Sprintf("%s|%d|%s|%d|%d|%s", format, version, kdf.Alg, kdf.Time, kdf.MemoryKiB, kdf.Salt))
}

func MarshalOpenHost(content *model.Content, options OpenHostOptions) ([]byte, error) {
	data := OpenHostData{
		Groups:       append([]model.Group(nil), content.Groups...),
		Hosts:        make([]OpenHostHost, 0, len(content.Hosts)),
		ForwardRules: make([]OpenHostForwardRule, 0, len(content.ForwardRules)),
	}
	credentials := make(map[string]model.Credential, len(content.Credentials))
	for _, credential := range content.Credentials {
		credentials[credential.ID] = credential
	}
	usedKeys := map[string]bool{}
	environments := make(map[string]model.Environment, len(content.Settings.Environments))
	for _, environment := range content.Settings.Environments {
		environments[environment.ID] = environment
	}
	for _, host := range content.Hosts {
		var keyID *string
		if options.IncludeKeys && host.CredentialID != nil {
			if credential, ok := credentials[*host.CredentialID]; ok && credential.Kind == model.CredentialKey {
				keyID = model.Ptr(credential.ID)
				usedKeys[credential.ID] = true
			}
		}
		var profile *model.TerminalProfile
		if source := options.Profiles[host.ID]; source != nil {
			copy := *source
			copy.CursorColor = clonePtr(source.CursorColor)
			profile = &copy
		}
		var environment *OpenHostEnvironment
		if host.EnvironmentID != nil {
			if source, ok := environments[*host.EnvironmentID]; ok {
				environment = &OpenHostEnvironment{Name: source.Name, Color: source.Color}
			}
		}
		tags := append([]string{}, host.Tags...)
		if tags == nil {
			tags = []string{}
		}
		data.Hosts = append(data.Hosts, OpenHostHost{
			ID: host.ID, Label: host.Label, Address: host.Address, Port: host.Port,
			Username: host.Username, AuthMethod: host.AuthMethod, KeyID: keyID,
			GroupID: clonePtr(host.GroupID), Tags: tags, Notes: host.Notes, Environment: environment,
			LegacyAlgorithms: host.LegacyAlgorithms,
			OSIcon:           host.OSIcon, Profile: profile,
		})
	}
	for _, rule := range content.ForwardRules {
		data.ForwardRules = append(data.ForwardRules, OpenHostForwardRule{
			HostID: rule.HostID, Label: clonePtr(rule.Label), BindAddress: rule.BindAddress,
			AllowNonLoopback: rule.AllowNonLoopback, BindPort: rule.BindPort,
			DestHost: rule.DestHost, DestPort: rule.DestPort,
		})
	}
	if options.IncludeKeys {
		for _, credential := range content.Credentials {
			if credential.Kind == model.CredentialKey && usedKeys[credential.ID] {
				data.Keys = append(data.Keys, OpenHostKey{ID: credential.ID, Name: credential.Name,
					PrivateKey: credential.PrivateKey, Passphrase: clonePtr(credential.Passphrase)})
			}
		}
	}
	file := OpenHostFile{Format: Format, Version: Version}
	if !options.IncludeKeys {
		now := options.Now
		if now == nil {
			now = time.Now
		}
		appVersion := options.AppVersion
		if appVersion == "" {
			appVersion = "0.3.0"
		}
		file.ExportedAt = now().UTC().Format(time.RFC3339Nano)
		file.App = appVersion
		file.Data = &data
		return json.Marshal(file)
	}
	plain, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	defer vault.Zero(plain)
	kdfFn := options.KDF
	if kdfFn == nil {
		kdfFn = vault.DefaultKDF
	}
	params := kdfFn(vault.RandomSalt())
	file.Encrypted = true
	file.KDF = &OpenHostKDF{Alg: "argon2id", Time: params.Time, MemoryKiB: params.MemoryKiB, Salt: base64.StdEncoding.EncodeToString(params.Salt)}
	kek := vault.DeriveKEK([]byte(options.FilePassword), params)
	defer vault.Zero(kek)
	sealed, err := vault.Seal(kek, plain, OpenHostAD(file.Format, file.Version, *file.KDF))
	if err != nil {
		return nil, err
	}
	file.Payload = base64.StdEncoding.EncodeToString(sealed)
	return json.Marshal(file)
}

func clonePtr[T any](value *T) *T {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

package importer

import (
	"errors"
	"io"
	"os"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/model"
)

func (p *ImportPreview) ResolveKeys(content *model.Content) error {
	for _, credential := range content.Credentials {
		if credential.Kind == model.CredentialKey && credential.Fingerprint != "" {
			p.credentialByFingerprint[credential.Fingerprint] = credential.ID
		}
	}
	for i := range p.Keys {
		key := &p.Keys[i]
		data, err := readKeyFile(key.Path)
		if errors.Is(err, os.ErrNotExist) {
			key.Status = KeyNotFound
			continue
		}
		if err != nil {
			key.Status = KeyUnsupported
			continue
		}
		p.keyData[key.Ref] = &keySecret{privateKey: data}
		parsed, err := domain.ParsePrivateKey(string(data), nil)
		if err != nil && apperr.CodeOf(err) == apperr.KeyBadPassphrase {
			key.Status = KeyNeedsPassphrase
			continue
		}
		if err != nil {
			key.Status = KeyUnsupported
			continue
		}
		setParsedKey(key, p.keyData[key.Ref], parsed, p.credentialByFingerprint)
	}
	p.syncKeyWarnings()
	return nil
}

func readKeyFile(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if info.Size() > int64(domain.MaxKeyBytes) {
		return nil, apperr.New(apperr.KeyUnsupported)
	}
	return io.ReadAll(io.LimitReader(f, int64(domain.MaxKeyBytes)+1))
}

func setParsedKey(key *PreviewKey, secret *keySecret, parsed domain.ParsedKey, existing map[string]string) {
	key.Fingerprint = model.Ptr(parsed.Fingerprint)
	key.Status = KeyReady
	if id := existing[parsed.Fingerprint]; id != "" {
		key.Status = KeyExisting
		secret.credentialID = id
	}
}

func (p *ImportPreview) UnlockKey(ref, passphrase string) (PreviewKey, error) {
	i, secret := p.findKey(ref)
	if i < 0 || secret == nil {
		return PreviewKey{}, apperr.New(apperr.NotFound)
	}
	parsed, err := domain.ParsePrivateKey(string(secret.privateKey), &passphrase)
	if err != nil {
		return PreviewKey{}, err
	}
	zero(secret.passphrase)
	secret.passphrase = []byte(passphrase)
	key := &p.Keys[i]
	key.Fingerprint = model.Ptr(parsed.Fingerprint)
	key.Status = KeyReady
	if id := p.credentialByFingerprint[parsed.Fingerprint]; id != "" {
		key.Status = KeyExisting
		secret.credentialID = id
	}
	p.syncKeyWarnings()
	return *key, nil
}

func (p *ImportPreview) SkipKey(ref string) (PreviewKey, error) {
	i, secret := p.findKey(ref)
	if i < 0 {
		return PreviewKey{}, apperr.New(apperr.NotFound)
	}
	if secret != nil {
		zero(secret.passphrase)
	}
	p.Keys[i].Status = KeySkipped
	p.syncKeyWarnings()
	return p.Keys[i], nil
}

func (p *ImportPreview) syncKeyWarnings() {
	statuses := make(map[string]KeyStatus, len(p.Keys))
	for _, key := range p.Keys {
		statuses[key.Ref] = key.Status
	}
	for i := range p.Rows {
		row := &p.Rows[i]
		kept := row.Warnings[:0]
		for _, warning := range row.Warnings {
			if warning.Code != WarningKeyNotFound && warning.Code != WarningKeyUnsupported {
				kept = append(kept, warning)
			}
		}
		row.Warnings = kept
		if row.KeyRef == nil {
			continue
		}
		switch statuses[*row.KeyRef] {
		case KeyNotFound:
			row.Warnings = append(row.Warnings, Warning{Code: WarningKeyNotFound})
		case KeyUnsupported:
			row.Warnings = append(row.Warnings, Warning{Code: WarningKeyUnsupported})
		}
	}
}

func (p *ImportPreview) findKey(ref string) (int, *keySecret) {
	for i := range p.Keys {
		if p.Keys[i].Ref == ref {
			return i, p.keyData[ref]
		}
	}
	return -1, nil
}

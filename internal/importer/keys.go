package importer

import (
	"bytes"
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
		secret := &keySecret{privateKey: data}
		p.keyData[key.Ref] = secret
		if isPPK(data) {
			converted, convertErr := ConvertPPK(data, nil)
			if convertErr != nil && apperr.CodeOf(convertErr) == apperr.KeyBadPassphrase {
				key.Status = KeyNeedsPassphrase
				continue
			}
			if convertErr != nil {
				key.Status = KeyUnsupported
				continue
			}
			zero(secret.privateKey)
			secret.privateKey = converted
		}
		parsed, err := domain.ParsePrivateKey(string(secret.privateKey), nil)
		if err != nil && apperr.CodeOf(err) == apperr.KeyBadPassphrase {
			key.Status = KeyNeedsPassphrase
			continue
		}
		if err != nil {
			key.Status = KeyUnsupported
			continue
		}
		setParsedKey(key, secret, parsed, p.credentialByFingerprint)
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
	privateKey := secret.privateKey
	convertedPPK := false
	if isPPK(privateKey) {
		var err error
		privateKey, err = ConvertPPK(privateKey, &passphrase)
		if err != nil {
			return PreviewKey{}, err
		}
		convertedPPK = true
	}
	parsed, err := domain.ParsePrivateKey(string(privateKey), &passphrase)
	if err != nil {
		if convertedPPK {
			zero(privateKey)
		}
		return PreviewKey{}, err
	}
	if convertedPPK {
		zero(secret.privateKey)
		secret.privateKey = privateKey
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

func isPPK(data []byte) bool {
	return bytes.HasPrefix(data, []byte(ppkV2Prefix)) || bytes.HasPrefix(data, []byte(ppkV3Prefix))
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

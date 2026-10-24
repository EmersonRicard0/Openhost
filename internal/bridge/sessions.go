package bridge

import (
	"context"
	"time"
	"unicode/utf8"

	"shellvault/internal/apperr"
	"shellvault/internal/domain"
	"shellvault/internal/localpty"
	"shellvault/internal/model"
	"shellvault/internal/session"
	"shellvault/internal/sshx"
	"shellvault/internal/validate"
	"shellvault/internal/vault"
)

const maxTerminalInput = 1024 * 1024

type OpenSessionResult struct {
	SessionID string `json:"sessionId"`
}

type ActiveSummary struct {
	Sessions  int `json:"sessions"`
	Transfers int `json:"transfers"`
	Forwards  int `json:"forwards"`
}

type SessionService struct {
	store    *vault.Store
	sessions *session.Manager
}

func newSessionService(store *vault.Store, sessions *session.Manager) *SessionService {
	return &SessionService{store: store, sessions: sessions}
}

func (s *SessionService) OpenSsh(hostID string) (OpenSessionResult, error) {
	if err := validate.UUID(hostID); err != nil {
		return OpenSessionResult{}, clean(err)
	}
	if _, err := s.optionsForHost(hostID); err != nil {
		return OpenSessionResult{}, clean(err)
	}
	id := s.sessions.Open(session.KindSSH, &hostID, s.dialHost(hostID))
	return OpenSessionResult{SessionID: id}, nil
}

func (s *SessionService) OpenLocal(shell string) (OpenSessionResult, error) {
	localShell := localpty.Shell(shell)
	if _, err := localpty.ShellPath(localShell); err != nil {
		return OpenSessionResult{}, clean(err)
	}
	id := s.sessions.Open(session.KindLocal, nil, func(context.Context, session.Interactor) (session.Conn, error) {
		return localpty.New(localShell)
	})
	return OpenSessionResult{SessionID: id}, nil
}

func (s *SessionService) Write(sessionID, data string) error {
	if err := validate.UUID(sessionID); err != nil {
		return clean(err)
	}
	if !utf8.ValidString(data) || len(data) > maxTerminalInput {
		return apperr.New(apperr.InvalidInput)
	}
	return clean(s.sessions.Write(sessionID, data))
}

func (s *SessionService) Resize(sessionID string, cols, rows int) error {
	if err := validate.UUID(sessionID); err != nil {
		return clean(err)
	}
	return clean(s.sessions.Resize(sessionID, cols, rows))
}

func (s *SessionService) Reconnect(sessionID string) error {
	if err := validate.UUID(sessionID); err != nil {
		return clean(err)
	}
	current, err := s.sessions.Get(sessionID)
	if err != nil {
		return clean(err)
	}
	if current.Kind != session.KindSSH || current.HostID == nil {
		return apperr.New(apperr.InvalidInput)
	}
	if _, err := s.optionsForHost(*current.HostID); err != nil {
		return clean(err)
	}
	return clean(s.sessions.Reconnect(sessionID, s.dialHost(*current.HostID)))
}

func (s *SessionService) Close(sessionID string) error {
	if err := validate.UUID(sessionID); err != nil {
		return clean(err)
	}
	return clean(s.sessions.Close(sessionID))
}

func (s *SessionService) AnswerHostKey(sessionID string, accept bool) error {
	if err := validate.UUID(sessionID); err != nil {
		return clean(err)
	}
	return clean(s.sessions.AnswerHostKey(sessionID, accept))
}

func (s *SessionService) AnswerPrompt(sessionID string, answers []string) error {
	if err := validate.UUID(sessionID); err != nil {
		return clean(err)
	}
	if len(answers) > 20 {
		return apperr.New(apperr.InvalidInput)
	}
	for _, answer := range answers {
		if !utf8.ValidString(answer) || utf8.RuneCountInString(answer) > 4096 {
			return apperr.New(apperr.InvalidInput)
		}
	}
	return clean(s.sessions.AnswerPrompt(sessionID, answers))
}

func (s *SessionService) ActiveSummary() (ActiveSummary, error) {
	return ActiveSummary{Sessions: s.sessions.ActiveCount()}, nil
}

func (s *SessionService) SendKeys(sessionID, combo string) error {
	keys, ok := map[string]string{
		"ctrl+w":   "\x17",
		"ctrl+t":   "\x14",
		"ctrl+tab": "\t",
		"ctrl+k":   "\x0b",
	}[combo]
	if !ok {
		return apperr.New(apperr.InvalidInput)
	}
	return s.Write(sessionID, keys)
}

func (s *SessionService) dialHost(hostID string) session.Dialer {
	return func(ctx context.Context, interactor session.Interactor) (session.Conn, error) {
		options, err := s.optionsForHost(hostID)
		if err != nil {
			return nil, err
		}
		client, err := sshx.Dial(ctx, options, interactor)
		if err != nil {
			return nil, err
		}
		return sshx.NewTerminal(client), nil
	}
}

func (s *SessionService) optionsForHost(hostID string) (sshx.Options, error) {
	content, err := s.store.Read()
	if err != nil {
		return sshx.Options{}, err
	}
	host, err := domain.FindHost(content, hostID)
	if err != nil {
		return sshx.Options{}, err
	}
	options := sshx.Options{
		Target:           sshx.Target{Address: host.Address, Port: host.Port, Username: host.Username},
		Auth:             sshx.Auth{Method: host.AuthMethod},
		ConnectTimeout:   time.Duration(content.Settings.ConnectTimeoutSeconds) * time.Second,
		Keepalive:        time.Duration(content.Settings.KeepaliveSeconds) * time.Second,
		LegacyAlgorithms: host.LegacyAlgorithms,
		KnownHosts:       storeKnownHosts{s.store},
	}
	if host.CredentialID == nil {
		if host.AuthMethod != model.AuthAsk && host.AuthMethod != model.AuthAgent {
			return sshx.Options{}, apperr.New(apperr.InvalidInput)
		}
		return options, nil
	}
	credential, err := domain.FindCredential(content, *host.CredentialID)
	if err != nil {
		return sshx.Options{}, err
	}
	switch host.AuthMethod {
	case model.AuthPassword:
		if credential.Kind != model.CredentialPassword {
			return sshx.Options{}, apperr.New(apperr.InvalidInput)
		}
		options.Auth.Password = credential.Password
	case model.AuthKey:
		if credential.Kind != model.CredentialKey {
			return sshx.Options{}, apperr.New(apperr.InvalidInput)
		}
		options.Auth.PrivateKey = credential.PrivateKey
		options.Auth.Passphrase = credential.Passphrase
	default:
		return sshx.Options{}, apperr.New(apperr.InvalidInput)
	}
	return options, nil
}

type storeKnownHosts struct {
	store *vault.Store
}

func (s storeKnownHosts) Check(endpoint, keyType, fingerprint string) (domain.HostKeyCheck, error) {
	content, err := s.store.Read()
	if err != nil {
		return domain.HostKeyCheck{}, err
	}
	return domain.CheckHostKey(content, endpoint, keyType, fingerprint), nil
}

func (s storeKnownHosts) Known(endpoint string) (string, error) {
	content, err := s.store.Read()
	if err != nil {
		return "", err
	}
	for _, known := range content.KnownHosts {
		if known.Endpoint == endpoint {
			return known.KeyType, nil
		}
	}
	return "", nil
}

func (s storeKnownHosts) Accept(endpoint, keyType, fingerprint string) error {
	return s.store.Mutate(func(content *model.Content) error {
		domain.AcceptHostKey(content, endpoint, keyType, fingerprint, domain.Now())
		return nil
	})
}

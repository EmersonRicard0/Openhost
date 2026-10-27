package bridge

import (
	"context"
	"strings"
	"sync"
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

const EventHostsChanged = "hosts:changed"

type HostsChangedEvent struct {
	HostID     string  `json:"hostId"`
	DetectedOS *string `json:"detectedOs"`
}

type SessionService struct {
	store         *vault.Store
	sessions      *session.Manager
	emit          session.Emitter
	sftpDial      func(sessionID, hostID string) session.Dialer
	transferCount func() int
	quickMu       sync.Mutex
	quickTargets  map[string]QuickTarget
}

func newSessionService(store *vault.Store, sessions *session.Manager, emit session.Emitter) *SessionService {
	return &SessionService{store: store, sessions: sessions, emit: emit, quickTargets: map[string]QuickTarget{}}
}

type QuickTarget struct {
	Address  string `json:"address"`
	Port     int    `json:"port"`
	Username string `json:"username"`
}

func (s *SessionService) OpenQuick(target QuickTarget) (OpenSessionResult, error) {
	if !validQuickTarget(target.Address, target.Port, target.Username) {
		return OpenSessionResult{}, quickInvalidField(quickField(target))
	}
	target.Address = domain.NormalizeAddress(target.Address)
	if _, err := s.quickOptions(target); err != nil {
		return OpenSessionResult{}, clean(err)
	}
	id := s.sessions.Open(session.KindSSH, nil, s.dialQuick(target))
	s.quickMu.Lock()
	s.quickTargets[id] = target
	s.quickMu.Unlock()
	return OpenSessionResult{SessionID: id}, nil
}

func quickField(target QuickTarget) string {
	if target.Address == "" || strings.TrimSpace(target.Address) != target.Address || strings.ContainsAny(target.Address, "[]") || !domain.IsValidAddress(target.Address) {
		return "address"
	}
	if target.Port < 1 || target.Port > 65535 {
		return "port"
	}
	return "username"
}

func quickInvalidField(field string) error {
	return &apperr.Error{Code: apperr.InvalidInput, Message: apperr.Messages[apperr.InvalidInput], Detail: "field: " + field}
}

func (s *SessionService) quickOptions(target QuickTarget) (sshx.Options, error) {
	content, err := s.store.Read()
	if err != nil {
		return sshx.Options{}, err
	}
	return sshx.Options{Target: sshx.Target{Address: domain.NormalizeAddress(target.Address), Port: target.Port, Username: target.Username}, Auth: sshx.Auth{Method: model.AuthAsk}, AgentFirst: true, ConnectTimeout: time.Duration(content.Settings.ConnectTimeoutSeconds) * time.Second, Keepalive: time.Duration(content.Settings.KeepaliveSeconds) * time.Second, LegacyAlgorithms: content.Settings.LegacyDefault, Term: content.Settings.Term, KnownHosts: storeKnownHosts{s.store}}, nil
}

func (s *SessionService) dialQuick(target QuickTarget) session.Dialer {
	return func(ctx context.Context, interactor session.Interactor) (session.Conn, error) {
		opts, err := s.quickOptions(target)
		if err != nil {
			return nil, err
		}
		client, err := sshx.Dial(ctx, opts, interactor)
		if err != nil {
			return nil, err
		}
		return sshx.NewTerminal(client), nil
	}
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
	process, err := localpty.New(localShell)
	if err != nil {
		return OpenSessionResult{}, clean(err)
	}
	id := s.sessions.Open(session.KindLocal, nil, func(context.Context, session.Interactor) (session.Conn, error) {
		return process, nil
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
	if current.HostID == nil {
		s.quickMu.Lock()
		target, ok := s.quickTargets[sessionID]
		s.quickMu.Unlock()
		if !ok || current.Kind != session.KindSSH {
			return apperr.New(apperr.InvalidInput)
		}
		return clean(s.sessions.Reconnect(sessionID, s.dialQuick(target)))
	}
	if _, err := s.optionsForHost(*current.HostID); err != nil {
		return clean(err)
	}
	var dial session.Dialer
	switch current.Kind {
	case session.KindSSH:
		dial = s.dialHost(*current.HostID)
	case session.KindSFTP:
		if s.sftpDial == nil {
			return apperr.New(apperr.InvalidInput)
		}
		dial = s.sftpDial(sessionID, *current.HostID)
	default:
		return apperr.New(apperr.InvalidInput)
	}
	return clean(s.sessions.Reconnect(sessionID, dial))
}

func (s *SessionService) Close(sessionID string) error {
	if err := validate.UUID(sessionID); err != nil {
		return clean(err)
	}
	err := s.sessions.Close(sessionID)
	s.quickMu.Lock()
	delete(s.quickTargets, sessionID)
	s.quickMu.Unlock()
	return clean(err)
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
	transfers := 0
	if s.transferCount != nil {
		transfers = s.transferCount()
	}
	return ActiveSummary{Sessions: s.sessions.ActiveCount(), Transfers: transfers}, nil
}

func (s *SessionService) SendKeys(sessionID, combo string) error {
	keys, ok := map[string]string{
		"ctrl+w":   "\x17",
		"ctrl+t":   "\x14",
		"ctrl+tab": "\t",
		"ctrl+k":   "\x0b",
		"ctrl+b":   "\x02",
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
		currentDetectedOS, err := s.detectedOSForHost(hostID)
		if err != nil {
			return nil, err
		}
		client, err := sshx.Dial(ctx, options, interactor)
		if err != nil {
			return nil, err
		}
		terminal := sshx.NewTerminal(client)
		startHostDetection(func() { s.detectHostOS(ctx, hostID, currentDetectedOS, client, terminal) })
		return terminal, nil
	}
}

func startHostDetection(detect func()) { go detect() }

func (s *SessionService) detectHostOS(ctx context.Context, hostID, currentDetectedOS string, client *sshx.Client, terminal *sshx.Terminal) {
	version := string(client.ServerVersion())
	banner := client.PreAuthBanner()
	probeResult := make(chan string, 1)
	probeOSRelease := shouldProbeOSRelease(version, banner, currentDetectedOS)
	if probeOSRelease {
		go func() { probeResult <- client.DetectOS(ctx) }()
	} else {
		probeResult <- ""
	}

	initialOutput := terminal.InitialOutput(ctx)
	var osReleaseID string
	select {
	case osReleaseID = <-probeResult:
	case <-ctx.Done():
		return
	}
	signals := sshx.Signals{
		Version:        version,
		Banner:         banner,
		Terminal:       initialOutput,
		ProbeOSRelease: probeOSRelease,
	}
	if osReleaseID != "" {
		signals.OSRelease = "ID=" + osReleaseID
	}
	if detected := sshx.ResolveOS(signals); detected != "" {
		_ = s.recordDetectedOS(hostID, detected)
	}
}

func shouldProbeOSRelease(version, banner, currentDetectedOS string) bool {
	_, probeVersion := sshx.ClassifyServerVersion(version)
	return probeVersion && sshx.ClassifyBanner(banner) == "" && !domain.IsNetworkOS(currentDetectedOS)
}

func (s *SessionService) detectedOSForHost(hostID string) (string, error) {
	content, err := s.store.Read()
	if err != nil {
		return "", err
	}
	host, err := domain.FindHost(content, hostID)
	if err != nil {
		return "", err
	}
	if host.DetectedOS == nil {
		return "", nil
	}
	return *host.DetectedOS, nil
}

func (s *SessionService) recordDetectedOS(hostID, detected string) error {
	var changed bool
	value := model.Ptr(detected)
	err := s.store.Mutate(func(content *model.Content) error {
		var err error
		changed, err = domain.SetDetectedOS(content, hostID, value, domain.Now())
		return err
	})
	if err != nil {
		return err
	}
	if changed && s.emit != nil {
		s.emit(EventHostsChanged, HostsChangedEvent{HostID: hostID, DetectedOS: value})
	}
	return nil
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
		Term:             content.Settings.Term,
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

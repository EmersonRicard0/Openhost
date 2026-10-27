package bridge

import (
	"context"
	"net/http"
	"sync"
	"time"

	"golang.org/x/oauth2"

	"shellvault/internal/apperr"
	"shellvault/internal/cloudsync"
)

const EventSyncState = "sync:state"

type SyncConnectResult struct {
	Email         string `json:"email"`
	CloudHasVault bool   `json:"cloudHasVault"`
}

type syncAuthorizer interface {
	Connect(context.Context) (cloudsync.OAuthSession, error)
	Cancel()
	Client(context.Context, *oauth2.Token) *http.Client
}

type pendingSyncConnection struct {
	session       cloudsync.OAuthSession
	drive         *cloudsync.Drive
	cloudHasVault bool
}

type SyncService struct {
	context     func() context.Context
	openBrowser func(string) error
	oauth       syncAuthorizer
	syncer      *cloudsync.Syncer
	newDrive    func(*http.Client) *cloudsync.Drive
	mu          sync.Mutex
	pending     *pendingSyncConnection
}

func newSyncService(contextFn func() context.Context, openBrowser func(string) error, oauth syncAuthorizer, syncer *cloudsync.Syncer, newDrive func(*http.Client) *cloudsync.Drive) *SyncService {
	return &SyncService{context: contextFn, openBrowser: openBrowser, oauth: oauth, syncer: syncer, newDrive: newDrive}
}

func (s *SyncService) Info() (cloudsync.SyncInfo, error) { return s.syncer.Info(), nil }

func (s *SyncService) Connect() (SyncConnectResult, error) {
	ctx := s.context()
	if ctx == nil {
		ctx = context.Background()
	}
	session, err := s.oauth.Connect(ctx)
	if err != nil {
		return SyncConnectResult{}, clean(err)
	}
	drive := s.newDrive(s.oauth.Client(ctx, session.Token))
	keyrings, err := drive.List(ctx, cloudsync.KeyringFiles, 2)
	if err != nil {
		return SyncConnectResult{}, clean(err)
	}
	if len(keyrings) > 1 {
		return SyncConnectResult{}, apperr.New(apperr.CloudCorrupt)
	}
	s.mu.Lock()
	s.pending = &pendingSyncConnection{session: session, drive: drive, cloudHasVault: len(keyrings) == 1}
	s.mu.Unlock()
	return SyncConnectResult{Email: session.Email, CloudHasVault: len(keyrings) == 1}, nil
}

func (s *SyncService) CancelConnect() error {
	s.oauth.Cancel()
	s.mu.Lock()
	s.pending = nil
	s.mu.Unlock()
	return nil
}

func (s *SyncService) Start(mode, cloudPassword string) (cloudsync.SyncInfo, error) {
	if mode != "upload" || cloudPassword != "" {
		return s.syncer.Info(), apperr.New(apperr.InvalidInput)
	}
	s.mu.Lock()
	pending := s.pending
	s.mu.Unlock()
	if pending == nil || pending.cloudHasVault || pending.session.Token == nil || pending.session.Token.RefreshToken == "" {
		return s.syncer.Info(), apperr.New(apperr.InvalidInput)
	}
	ctx := s.context()
	if ctx == nil {
		ctx = context.Background()
	}
	account := cloudsync.SyncAccount{Email: pending.session.Email, RefreshToken: pending.session.Token.RefreshToken}
	if err := s.syncer.StartUpload(ctx, account, pending.drive); err != nil {
		return s.syncer.Info(), clean(err)
	}
	s.mu.Lock()
	s.pending = nil
	s.mu.Unlock()
	return s.syncer.Info(), nil
}

func (s *SyncService) SyncNow() (cloudsync.SyncInfo, error) {
	ctx := s.context()
	if ctx == nil {
		ctx = context.Background()
	}
	if err := s.syncer.SyncNow(ctx); err != nil {
		return s.syncer.Info(), clean(err)
	}
	return s.syncer.Info(), nil
}

func (s *SyncService) SetDeviceName(name string) error { return clean(s.syncer.SetDeviceName(name)) }

func refreshToken(value string) *oauth2.Token {
	return &oauth2.Token{RefreshToken: value, Expiry: time.Unix(0, 0)}
}

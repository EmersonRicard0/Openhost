package cloudsync

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"golang.org/x/oauth2"

	"shellvault/internal/apperr"
)

const oauthTimeout = 5 * time.Minute

type oauthEndpoints struct {
	Auth   string
	Token  string
	Revoke string
}

type OAuthSession struct {
	Email string
	Token *oauth2.Token
}

type OAuth struct {
	httpClient *http.Client
	open       func(string) error
	endpoints  oauthEndpoints
	timeout    time.Duration

	mu       sync.Mutex
	cancel   context.CancelFunc
	listener net.Listener
}

func NewOAuth(open func(string) error) *OAuth {
	return newOAuth(http.DefaultClient, open, configuredOAuthEndpoints())
}

func newOAuth(client *http.Client, open func(string) error, endpoints oauthEndpoints) *OAuth {
	if client == nil {
		client = http.DefaultClient
	}
	return &OAuth{httpClient: client, open: open, endpoints: endpoints, timeout: oauthTimeout}
}

func (o *OAuth) config(redirect string) *oauth2.Config {
	credentials := Credentials()
	return &oauth2.Config{
		ClientID: credentials.ClientID, ClientSecret: credentials.ClientSecret, RedirectURL: redirect,
		Scopes:   []string{"https://www.googleapis.com/auth/drive.appdata", "openid", "email"},
		Endpoint: oauth2.Endpoint{AuthURL: o.endpoints.Auth, TokenURL: o.endpoints.Token, AuthStyle: oauth2.AuthStyleInParams},
	}
}

type oauthReturn struct {
	code string
	err  error
}

func (o *OAuth) Connect(parent context.Context) (OAuthSession, error) {
	if !Available() || o.open == nil {
		return OAuthSession{}, apperr.New(apperr.SyncUnavailable)
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return OAuthSession{}, apperr.New(apperr.Network)
	}
	ctx, cancel := context.WithTimeout(parent, o.timeout)
	if !o.begin(cancel, listener) {
		cancel()
		_ = listener.Close()
		return OAuthSession{}, apperr.New(apperr.SyncAuth)
	}
	defer func() {
		cancel()
		_ = listener.Close()
		o.finish(listener)
	}()

	state, err := oauthRandom(32)
	if err != nil {
		return OAuthSession{}, apperr.New(apperr.Internal)
	}
	verifier, err := oauthRandom(32)
	if err != nil {
		return OAuthSession{}, apperr.New(apperr.Internal)
	}
	digest := sha256.Sum256([]byte(verifier))
	challenge := base64.RawURLEncoding.EncodeToString(digest[:])
	redirect := "http://" + listener.Addr().String() + "/oauth/callback"
	config := o.config(redirect)
	returned := make(chan oauthReturn, 1)
	var once sync.Once
	server := &http.Server{ReadHeaderTimeout: 5 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet || request.URL.Path != "/oauth/callback" {
			http.NotFound(w, request)
			return
		}
		result := oauthReturn{}
		query := request.URL.Query()
		switch {
		case query.Get("state") != state:
			result.err = apperr.New(apperr.SyncAuth)
		case query.Get("error") != "":
			result.err = apperr.New(apperr.SyncCancelled)
		case query.Get("code") == "" || len(query.Get("code")) > 4096:
			result.err = apperr.New(apperr.SyncAuth)
		default:
			result.code = query.Get("code")
		}
		once.Do(func() { returned <- result })
		if result.err != nil {
			http.Error(w, "retorno de autorização inválido", http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = io.WriteString(w, "<!doctype html><title>OpenHost</title><p>Autorização concluída. Você pode fechar esta janela.</p>")
	})}
	serveDone := make(chan struct{})
	go func() { _ = server.Serve(listener); close(serveDone) }()
	defer func() { _ = server.Close(); <-serveDone }()

	authURL := config.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent"),
		oauth2.SetAuthURLParam("code_challenge", challenge), oauth2.SetAuthURLParam("code_challenge_method", "S256"))
	if err := o.open(authURL); err != nil {
		return OAuthSession{}, apperr.New(apperr.SyncCancelled)
	}
	var callback oauthReturn
	select {
	case callback = <-returned:
	case <-ctx.Done():
		return OAuthSession{}, apperr.New(apperr.SyncCancelled)
	}
	if callback.err != nil {
		return OAuthSession{}, callback.err
	}
	oauthContext := context.WithValue(ctx, oauth2.HTTPClient, o.httpClient)
	token, err := config.Exchange(oauthContext, callback.code, oauth2.SetAuthURLParam("code_verifier", verifier))
	if err != nil || token == nil || token.RefreshToken == "" {
		return OAuthSession{}, apperr.New(apperr.SyncAuth)
	}
	rawID, ok := token.Extra("id_token").(string)
	if !ok {
		return OAuthSession{}, apperr.New(apperr.SyncAuth)
	}
	email, err := oauthEmail(rawID, Credentials().ClientID, time.Now())
	if err != nil {
		return OAuthSession{}, apperr.New(apperr.SyncAuth)
	}
	return OAuthSession{Email: email, Token: token}, nil
}

func (o *OAuth) Cancel() {
	o.mu.Lock()
	cancel, listener := o.cancel, o.listener
	o.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if listener != nil {
		_ = listener.Close()
	}
}

func (o *OAuth) Refresh(ctx context.Context, token *oauth2.Token) (*oauth2.Token, error) {
	if token == nil || token.RefreshToken == "" {
		return nil, apperr.New(apperr.SyncAuth)
	}
	ctx = context.WithValue(ctx, oauth2.HTTPClient, o.httpClient)
	refreshed, err := o.config("").TokenSource(ctx, token).Token()
	if err != nil {
		return nil, apperr.New(apperr.SyncAuth)
	}
	return refreshed, nil
}

func (o *OAuth) Client(ctx context.Context, token *oauth2.Token) *http.Client {
	ctx = context.WithValue(ctx, oauth2.HTTPClient, o.httpClient)
	return o.config("").Client(ctx, token)
}

func (o *OAuth) Revoke(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		return nil
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, o.endpoints.Revoke, strings.NewReader(url.Values{"token": {refreshToken}}.Encode()))
	if err != nil {
		return apperr.New(apperr.SyncAuth)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := o.httpClient.Do(request)
	if err != nil {
		return apperr.New(apperr.Network)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return apperr.New(apperr.SyncAuth)
	}
	return nil
}

func (o *OAuth) begin(cancel context.CancelFunc, listener net.Listener) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.cancel != nil {
		return false
	}
	o.cancel, o.listener = cancel, listener
	return true
}

func (o *OAuth) finish(listener net.Listener) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.listener == listener {
		o.cancel, o.listener = nil, nil
	}
}

func oauthRandom(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func oauthEmail(raw, audience string, now time.Time) (string, error) {
	parts := strings.Split(raw, ".")
	if len(parts) != 3 {
		return "", errors.New("invalid id token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(payload) > 64<<10 {
		return "", errors.New("invalid id token")
	}
	var claims struct {
		Issuer   string `json:"iss"`
		Audience string `json:"aud"`
		Expires  int64  `json:"exp"`
		Email    string `json:"email"`
	}
	// O id_token do Google traz outras claims (sub, azp, iat, email_verified…): aqui só
	// importam estas, então campos a mais não são erro.
	if json.Unmarshal(payload, &claims) != nil || (claims.Issuer != "https://accounts.google.com" && claims.Issuer != "accounts.google.com") ||
		claims.Audience != audience || claims.Expires <= now.Unix() || !validOAuthEmail(claims.Email) {
		return "", errors.New("invalid id token claims")
	}
	return claims.Email, nil
}

func validOAuthEmail(value string) bool {
	return utf8.ValidString(value) && len(value) <= 320 && strings.Count(value, "@") == 1 &&
		strings.IndexFunc(value, func(r rune) bool { return r <= 0x20 || r == 0x7f }) < 0
}

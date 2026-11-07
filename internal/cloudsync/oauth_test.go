package cloudsync

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"golang.org/x/oauth2"

	"shellvault/internal/apperr"
	"shellvault/internal/cloudsync/drivefake"
)

func oauthForTest(t *testing.T, fake *drivefake.Server, open func(string) error) *OAuth {
	t.Helper()
	oldID, oldSecret := ClientID, ClientSecret
	ClientID, ClientSecret = "test-client", "test-secret"
	t.Cleanup(func() { ClientID, ClientSecret = oldID, oldSecret })
	return newOAuth(fake.Client(), open, oauthEndpoints{Auth: fake.URL() + "/auth", Token: fake.URL() + "/token", Revoke: fake.URL() + "/revoke"})
}

func TestOAuthConnectUsesLoopbackStateAndPKCE(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	var redirect string
	oauth := oauthForTest(t, fake, func(raw string) error {
		parsed, err := url.Parse(raw)
		if err != nil {
			return err
		}
		query := parsed.Query()
		redirect = query.Get("redirect_uri")
		if !strings.HasPrefix(redirect, "http://127.0.0.1:") || query.Get("code_challenge") == "" || query.Get("code_challenge_method") != "S256" || query.Get("state") == "" {
			t.Errorf("URL OAuth insegura: %s", raw)
		}
		go func() {
			response, err := http.Get(redirect + "?code=codigo&state=" + url.QueryEscape(query.Get("state")))
			if err == nil {
				_ = response.Body.Close()
			}
		}()
		return nil
	})
	session, err := oauth.Connect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if session.Email != "usuario@example.com" || session.Token == nil || session.Token.RefreshToken != "refresh" {
		t.Fatalf("sessão = %+v", session)
	}
	requests := fake.Requests()
	last := requests[len(requests)-1]
	if last.Operation != "token" || last.Code != "codigo" || last.Verifier == "" {
		t.Fatalf("troca sem PKCE: %+v", last)
	}
}

func TestOAuthRejectsWrongStateAndCanCancel(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	oauth := oauthForTest(t, fake, func(raw string) error {
		parsed, _ := url.Parse(raw)
		go func() {
			response, err := http.Get(parsed.Query().Get("redirect_uri") + "?code=codigo&state=errado")
			if err == nil {
				_ = response.Body.Close()
			}
		}()
		return nil
	})
	if _, err := oauth.Connect(context.Background()); apperr.CodeOf(err) != apperr.SyncAuth {
		t.Fatalf("state errado = %v", err)
	}

	opened := make(chan struct{})
	oauth = oauthForTest(t, fake, func(string) error { close(opened); return nil })
	done := make(chan error, 1)
	go func() { _, err := oauth.Connect(context.Background()); done <- err }()
	<-opened
	oauth.Cancel()
	if err := <-done; apperr.CodeOf(err) != apperr.SyncCancelled {
		t.Fatalf("cancelamento = %v", err)
	}
}

func TestOAuthTimeoutRefreshAndRevoke(t *testing.T) {
	fake := drivefake.New()
	defer fake.Close()
	oauth := oauthForTest(t, fake, func(string) error { return nil })
	oauth.timeout = 20 * time.Millisecond
	if _, err := oauth.Connect(context.Background()); apperr.CodeOf(err) != apperr.SyncCancelled {
		t.Fatalf("timeout = %v", err)
	}
	expired := &oauth2.Token{AccessToken: "old", RefreshToken: "refresh", Expiry: time.Now().Add(-time.Hour)}
	refreshed, err := oauth.Refresh(context.Background(), expired)
	if err != nil || refreshed.AccessToken != "access" {
		t.Fatalf("refresh = %+v, %v", refreshed, err)
	}
	if err := oauth.Revoke(context.Background(), "refresh"); err != nil {
		t.Fatal(err)
	}
	requests := fake.Requests()
	if requests[len(requests)-1].Operation != "revoke" || requests[len(requests)-1].Token != "refresh" {
		t.Fatalf("revoke = %+v", requests[len(requests)-1])
	}
}

func TestOAuthEmailAcceptsGoogleIDTokenClaims(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	claims := `{"iss":"https://accounts.google.com","azp":"client-id","aud":"client-id","sub":"1234567890",` +
		`"email":"usuario@example.com","email_verified":true,"at_hash":"abc","iat":1799996400,"exp":1800003600}`
	raw := "e30." + base64.RawURLEncoding.EncodeToString([]byte(claims)) + ".assinatura"
	email, err := oauthEmail(raw, "client-id", now)
	if err != nil || email != "usuario@example.com" {
		t.Fatalf("id_token com claims do Google = %q, %v", email, err)
	}
	if _, err := oauthEmail(raw, "outro-cliente", now); err == nil {
		t.Fatal("aud diferente foi aceito")
	}
}

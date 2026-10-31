package drivefake

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

func TestTokenAndRevokeRoutes(t *testing.T) {
	server := New()
	defer server.Close()
	response, err := server.Client().PostForm(server.URL()+"/token", url.Values{"code": {"codigo"}})
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(response.Body)
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK || !strings.Contains(string(body), "refresh_token") {
		t.Fatalf("token = %d %s", response.StatusCode, body)
	}
	response, err = server.Client().PostForm(server.URL()+"/revoke", url.Values{"token": {"refresh"}})
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if response.StatusCode != http.StatusOK || !server.SawOperation("revoke") {
		t.Fatalf("revoke = %d", response.StatusCode)
	}
}

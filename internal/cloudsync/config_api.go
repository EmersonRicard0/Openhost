//go:build !e2e

package cloudsync

func configuredDriveAPIBase() string { return googleAPIBase }

func configuredOAuthEndpoints() oauthEndpoints {
	return oauthEndpoints{Auth: "https://accounts.google.com/o/oauth2/v2/auth", Token: "https://oauth2.googleapis.com/token", Revoke: "https://oauth2.googleapis.com/revoke"}
}

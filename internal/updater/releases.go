package updater

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const defaultReleasesURL = "https://api.github.com/repos/EmersonRicard0/Openhost/releases?per_page=20"

var ErrRateLimited = errors.New("RATE_LIMITED")

type Config struct {
	ReleasesURL      string
	UserAgent        string
	Client           *http.Client
	PublicKey        ed25519.PublicKey
	FreeSpace        func(string) (uint64, error)
	ProgressInterval time.Duration
}

type Asset struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	URL  string `json:"browser_download_url"`
}

type Release struct {
	Version     string  `json:"-"`
	TagName     string  `json:"tag_name"`
	Draft       bool    `json:"draft"`
	Prerelease  bool    `json:"prerelease"`
	PublishedAt string  `json:"published_at"`
	Notes       string  `json:"body"`
	Assets      []Asset `json:"assets"`
}

type Choice struct {
	Version     string `json:"version"`
	Prerelease  bool   `json:"prerelease"`
	PublishedAt string `json:"publishedAt"`
	Notes       string `json:"notes"`
	Package     Asset  `json:"package"`
	Checksums   Asset  `json:"checksums"`
	Signature   Asset  `json:"signature"`
}

func FetchReleases(ctx context.Context, cfg Config, etag string) ([]Release, string, bool, error) {
	url := cfg.ReleasesURL
	if url == "" {
		url = defaultReleasesURL
	}
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, etag, false, err
	}
	userAgent := strings.TrimSpace(cfg.UserAgent)
	if userAgent == "" {
		userAgent = "OpenHost/dev"
	}
	request.Header.Set("User-Agent", userAgent)
	if etag != "" {
		request.Header.Set("If-None-Match", etag)
	}

	response, err := client.Do(request)
	if err != nil {
		return nil, etag, false, err
	}
	defer response.Body.Close()
	nextETag := response.Header.Get("ETag")
	if nextETag == "" {
		nextETag = etag
	}
	switch response.StatusCode {
	case http.StatusNotModified:
		return nil, nextETag, true, nil
	case http.StatusForbidden, http.StatusTooManyRequests:
		return nil, nextETag, false, ErrRateLimited
	case http.StatusOK:
	default:
		return nil, nextETag, false, fmt.Errorf("release service returned HTTP %d", response.StatusCode)
	}

	var releases []Release
	decoder := json.NewDecoder(io.LimitReader(response.Body, 4<<20))
	if err := decoder.Decode(&releases); err != nil {
		return nil, nextETag, false, fmt.Errorf("decode releases: %w", err)
	}
	for index := range releases {
		releases[index].Version = strings.TrimPrefix(strings.TrimSpace(releases[index].TagName), "v")
	}
	return releases, nextETag, false, nil
}

func Pick(releases []Release, current string, prerelease bool, install Install, goos, goarch string) *Choice {
	currentVersion, ok := parseSemver(strings.TrimPrefix(strings.TrimSpace(current), "v"))
	if !ok {
		return nil
	}
	var best *Choice
	var bestVersion semver
	for _, release := range releases {
		if release.Draft {
			continue
		}
		versionText := release.Version
		if versionText == "" {
			versionText = strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
		}
		version, valid := parseSemver(versionText)
		if !valid || compareSemver(version, currentVersion) <= 0 || (release.Prerelease || len(version.pre) > 0) && !prerelease {
			continue
		}
		name := packageName(versionText, install.Kind, goos, goarch)
		if name == "" {
			continue
		}
		packageAsset, found := assetNamed(release.Assets, name)
		if !found {
			continue
		}
		if best != nil && compareSemver(version, bestVersion) <= 0 {
			continue
		}
		checksums, _ := assetNamed(release.Assets, "SHA256SUMS.txt")
		signature, _ := assetNamed(release.Assets, "SHA256SUMS.txt.sig")
		bestVersion = version
		best = &Choice{
			Version: versionText, Prerelease: release.Prerelease || len(version.pre) > 0,
			PublishedAt: release.PublishedAt, Notes: release.Notes, Package: packageAsset,
			Checksums: checksums, Signature: signature,
		}
	}
	return best
}

func assetNamed(assets []Asset, name string) (Asset, bool) {
	for _, asset := range assets {
		if asset.Name == name && asset.Size >= 0 && asset.URL != "" {
			return asset, true
		}
	}
	return Asset{}, false
}

func packageName(version string, kind InstallKind, goos, goarch string) string {
	switch kind {
	case InstallNSIS, InstallUnmanaged:
		if goos == "windows" && goarch == "amd64" {
			return "OpenHost-" + version + "-windows-amd64-installer.exe"
		}
	case InstallApp, InstallAppReadonly:
		if goos == "darwin" && (goarch == "amd64" || goarch == "arm64") {
			return "OpenHost-" + version + "-macos-universal.dmg"
		}
	case InstallAppImage:
		if goos == "linux" {
			if goarch == "amd64" {
				return "OpenHost-" + version + "-x86_64.AppImage"
			}
			if goarch == "arm64" {
				return "OpenHost-" + version + "-aarch64.AppImage"
			}
		}
	case InstallDEB:
		if goos == "linux" && (goarch == "amd64" || goarch == "arm64") {
			return "openhost_" + version + "_" + goarch + ".deb"
		}
	case InstallRPM:
		if goos == "linux" {
			arch := map[string]string{"amd64": "x86_64", "arm64": "aarch64"}[goarch]
			if arch != "" {
				return "openhost-" + version + "-1." + arch + ".rpm"
			}
		}
	}
	return ""
}

type semver struct {
	major int
	minor int
	patch int
	pre   []string
}

func parseSemver(value string) (semver, bool) {
	value = strings.SplitN(value, "+", 2)[0]
	parts := strings.SplitN(value, "-", 2)
	core := strings.Split(parts[0], ".")
	if len(core) != 3 {
		return semver{}, false
	}
	numbers := make([]int, 3)
	for index, part := range core {
		if part == "" || len(part) > 1 && part[0] == '0' {
			return semver{}, false
		}
		number, err := strconv.Atoi(part)
		if err != nil || number < 0 {
			return semver{}, false
		}
		numbers[index] = number
	}
	result := semver{major: numbers[0], minor: numbers[1], patch: numbers[2]}
	if len(parts) == 2 {
		if parts[1] == "" {
			return semver{}, false
		}
		result.pre = strings.Split(parts[1], ".")
		for _, identifier := range result.pre {
			if identifier == "" {
				return semver{}, false
			}
			numeric := true
			for _, char := range identifier {
				if !(char >= '0' && char <= '9' || char >= 'A' && char <= 'Z' || char >= 'a' && char <= 'z' || char == '-') {
					return semver{}, false
				}
				if char < '0' || char > '9' {
					numeric = false
				}
			}
			if numeric && len(identifier) > 1 && identifier[0] == '0' {
				return semver{}, false
			}
		}
	}
	return result, true
}

func compareSemver(left, right semver) int {
	for _, pair := range [][2]int{{left.major, right.major}, {left.minor, right.minor}, {left.patch, right.patch}} {
		if pair[0] < pair[1] {
			return -1
		}
		if pair[0] > pair[1] {
			return 1
		}
	}
	if len(left.pre) == 0 && len(right.pre) == 0 {
		return 0
	}
	if len(left.pre) == 0 {
		return 1
	}
	if len(right.pre) == 0 {
		return -1
	}
	for index := 0; index < len(left.pre) && index < len(right.pre); index++ {
		if left.pre[index] == right.pre[index] {
			continue
		}
		leftNumeric := numericIdentifier(left.pre[index])
		rightNumeric := numericIdentifier(right.pre[index])
		switch {
		case leftNumeric && rightNumeric:
			if len(left.pre[index]) < len(right.pre[index]) || len(left.pre[index]) == len(right.pre[index]) && left.pre[index] < right.pre[index] {
				return -1
			}
			return 1
		case leftNumeric:
			return -1
		case rightNumeric:
			return 1
		case left.pre[index] < right.pre[index]:
			return -1
		default:
			return 1
		}
	}
	if len(left.pre) < len(right.pre) {
		return -1
	}
	if len(left.pre) > len(right.pre) {
		return 1
	}
	return 0
}

func numericIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for _, char := range value {
		if char < '0' || char > '9' {
			return false
		}
	}
	return true
}

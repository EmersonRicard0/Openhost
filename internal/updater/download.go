package updater

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const defaultProgressInterval = 250 * time.Millisecond

var (
	ErrDiskSpace   = errors.New("diskSpace")
	ErrSize        = errors.New("size")
	ErrUnsafeAsset = errors.New("unsafe asset")
)

type Progress struct {
	Received int64 `json:"received"`
	Total    int64 `json:"total"`
}

// Download grava o asset em directory com o sufixo .part e retoma um parcial existente.
// O chamador fornece apenas assets escolhidos por Pick e um diretório interno do app.
func Download(ctx context.Context, cfg Config, asset Asset, directory string, progress func(Progress)) (string, error) {
	if err := validateDownloadAsset(cfg, asset); err != nil {
		return "", err
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return "", fmt.Errorf("create update directory: %w", err)
	}
	freeSpace := cfg.FreeSpace
	if freeSpace == nil {
		freeSpace = diskFreeSpace
	}
	available, err := freeSpace(directory)
	if err != nil {
		return "", fmt.Errorf("check disk space: %w", err)
	}
	if uint64(asset.Size) > math.MaxUint64/2 || available < uint64(asset.Size)*2 {
		return "", ErrDiskSpace
	}

	target := filepath.Join(directory, asset.Name)
	partial := target + ".part"
	offset, err := partialSize(partial, asset.Size)
	if err != nil {
		return "", err
	}
	if offset == asset.Size {
		if err := replaceDownloadedFile(partial, target); err != nil {
			return "", err
		}
		emitProgress(progress, Progress{Received: offset, Total: asset.Size})
		return target, nil
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, asset.URL, nil)
	if err != nil {
		return "", fmt.Errorf("create download request: %w", err)
	}
	if offset > 0 {
		request.Header.Set("Range", fmt.Sprintf("bytes=%d-", offset))
	}
	request.Header.Set("User-Agent", downloadUserAgent(cfg))

	client := downloadClient(cfg)
	response, err := client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			_ = os.Remove(partial)
			return "", ctx.Err()
		}
		return "", fmt.Errorf("download package: %w", err)
	}
	defer response.Body.Close()

	appendPartial := offset > 0 && response.StatusCode == http.StatusPartialContent
	switch {
	case appendPartial:
		if !validContentRange(response.Header.Get("Content-Range"), offset, asset.Size) {
			return "", ErrSize
		}
	case response.StatusCode == http.StatusOK:
		offset = 0
	case response.StatusCode == http.StatusRequestedRangeNotSatisfiable:
		_ = os.Remove(partial)
		return "", ErrSize
	default:
		return "", fmt.Errorf("download package: HTTP %d", response.StatusCode)
	}

	flags := os.O_CREATE | os.O_WRONLY
	if appendPartial {
		flags |= os.O_APPEND
	} else {
		flags |= os.O_TRUNC
	}
	file, err := os.OpenFile(partial, flags, 0o600)
	if err != nil {
		return "", fmt.Errorf("open partial download: %w", err)
	}

	interval := cfg.ProgressInterval
	if interval <= 0 {
		interval = defaultProgressInterval
	}
	emitProgress(progress, Progress{Received: offset, Total: asset.Size})
	written := offset
	lastProgress := time.Now()
	buffer := make([]byte, 64*1024)
	for {
		count, readErr := response.Body.Read(buffer)
		if count > 0 {
			if written+int64(count) > asset.Size {
				_ = file.Close()
				_ = os.Remove(partial)
				return "", ErrSize
			}
			stored, writeErr := file.Write(buffer[:count])
			written += int64(stored)
			if writeErr != nil {
				_ = file.Close()
				return "", fmt.Errorf("write partial download: %w", writeErr)
			}
			if stored != count {
				_ = file.Close()
				return "", io.ErrShortWrite
			}
			if progress != nil && written < asset.Size && time.Since(lastProgress) >= interval {
				progress(Progress{Received: written, Total: asset.Size})
				lastProgress = time.Now()
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				break
			}
			_ = file.Close()
			if ctx.Err() != nil {
				_ = os.Remove(partial)
				return "", ctx.Err()
			}
			return "", fmt.Errorf("read package: %w", readErr)
		}
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return "", fmt.Errorf("sync partial download: %w", err)
	}
	if err := file.Close(); err != nil {
		return "", fmt.Errorf("close partial download: %w", err)
	}
	if written != asset.Size {
		_ = os.Remove(partial)
		return "", ErrSize
	}
	if err := replaceDownloadedFile(partial, target); err != nil {
		return "", err
	}
	emitProgress(progress, Progress{Received: written, Total: asset.Size})
	return target, nil
}

func partialSize(path string, expected int64) (int64, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("stat partial download: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() > expected {
		if removeErr := os.Remove(path); removeErr != nil {
			return 0, fmt.Errorf("discard invalid partial download: %w", removeErr)
		}
		return 0, nil
	}
	return info.Size(), nil
}

func replaceDownloadedFile(partial, target string) error {
	if err := os.Remove(target); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("replace downloaded package: %w", err)
	}
	if err := os.Rename(partial, target); err != nil {
		return fmt.Errorf("finish download: %w", err)
	}
	return nil
}

func validateDownloadAsset(cfg Config, asset Asset) error {
	if asset.Size <= 0 || asset.Name == "" || filepath.Base(asset.Name) != asset.Name || strings.ContainsAny(asset.Name, `/\\`) || !knownDownloadAssetName(asset.Name) {
		return ErrUnsafeAsset
	}
	assetURL, err := url.Parse(asset.URL)
	if err != nil || !validDownloadURL(cfg, assetURL, false) {
		return ErrUnsafeAsset
	}
	return nil
}

func knownDownloadAssetName(name string) bool {
	return name == "SHA256SUMS.txt" || name == "SHA256SUMS.txt.sig" || knownPackageName(name)
}

func validDownloadURL(cfg Config, assetURL *url.URL, allowQuery bool) bool {
	if assetURL.User != nil || assetURL.Host == "" || assetURL.Fragment != "" || !allowQuery && assetURL.RawQuery != "" {
		return false
	}
	if cfg.ReleasesURL != "" {
		baseURL, baseErr := url.Parse(cfg.ReleasesURL)
		if baseErr != nil || !sameOrigin(assetURL, baseURL) {
			return false
		}
		return true
	}
	if assetURL.Scheme != "https" || !allowedReleaseHost(assetURL.Hostname()) {
		return false
	}
	return true
}

func sameOrigin(left, right *url.URL) bool {
	return strings.EqualFold(left.Scheme, right.Scheme) && strings.EqualFold(left.Host, right.Host)
}

func allowedReleaseHost(host string) bool {
	switch strings.ToLower(host) {
	case "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com":
		return true
	default:
		return false
	}
}

func knownPackageName(name string) bool {
	formats := []struct {
		prefix string
		suffix string
	}{
		{"OpenHost-", "-windows-amd64-installer.exe"},
		{"OpenHost-", "-macos-universal.dmg"},
		{"OpenHost-", "-x86_64.AppImage"},
		{"OpenHost-", "-aarch64.AppImage"},
		{"openhost_", "_amd64.deb"},
		{"openhost_", "_arm64.deb"},
		{"openhost-", "-1.x86_64.rpm"},
		{"openhost-", "-1.aarch64.rpm"},
	}
	for _, format := range formats {
		if !strings.HasPrefix(name, format.prefix) || !strings.HasSuffix(name, format.suffix) {
			continue
		}
		version := strings.TrimSuffix(strings.TrimPrefix(name, format.prefix), format.suffix)
		if _, valid := parseSemver(version); valid {
			return true
		}
	}
	return false
}

func downloadClient(cfg Config) *http.Client {
	base := cfg.Client
	if base == nil {
		base = &http.Client{Timeout: 30 * time.Minute}
	}
	client := *base
	previousRedirect := client.CheckRedirect
	client.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if !validDownloadURL(cfg, request.URL, true) {
			return ErrUnsafeAsset
		}
		if previousRedirect != nil {
			return previousRedirect(request, via)
		}
		if len(via) >= 10 {
			return errors.New("too many redirects")
		}
		return nil
	}
	return &client
}

func downloadUserAgent(cfg Config) string {
	if value := strings.TrimSpace(cfg.UserAgent); value != "" {
		return value
	}
	return "OpenHost/dev"
}

func validContentRange(value string, offset, total int64) bool {
	if !strings.HasPrefix(value, "bytes ") {
		return false
	}
	parts := strings.Split(strings.TrimPrefix(value, "bytes "), "/")
	if len(parts) != 2 {
		return false
	}
	declaredTotal, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || declaredTotal != total {
		return false
	}
	rangeParts := strings.Split(parts[0], "-")
	if len(rangeParts) != 2 {
		return false
	}
	start, err := strconv.ParseInt(rangeParts[0], 10, 64)
	if err != nil || start != offset {
		return false
	}
	end, err := strconv.ParseInt(rangeParts[1], 10, 64)
	return err == nil && end == total-1
}

func emitProgress(callback func(Progress), value Progress) {
	if callback != nil {
		callback(value)
	}
}

// CleanupOldVersions removes apenas diretórios filhos com nomes SemVer diferentes de keep.
func CleanupOldVersions(updatesDir, keep string) error {
	entries, err := os.ReadDir(updatesDir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("list update versions: %w", err)
	}
	keep = strings.TrimPrefix(strings.TrimSpace(keep), "v")
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == keep {
			continue
		}
		if _, valid := parseSemver(entry.Name()); !valid {
			continue
		}
		if err := os.RemoveAll(filepath.Join(updatesDir, entry.Name())); err != nil {
			return fmt.Errorf("remove old update %s: %w", entry.Name(), err)
		}
	}
	return nil
}

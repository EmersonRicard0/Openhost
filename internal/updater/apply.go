package updater

import (
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var ErrUnsafeManifest = errors.New("unsafe update manifest")

type ApplyManifest struct {
	PID         int         `json:"pid"`
	Version     string      `json:"version"`
	Install     InstallKind `json:"install"`
	PackagePath string      `json:"packagePath"`
	TargetPath  string      `json:"targetPath"`
	Relaunch    []string    `json:"relaunch"`
}

type LastUpdateResult struct {
	Version string `json:"version"`
	Status  string `json:"status"`
	Reason  string `json:"reason,omitempty"`
	At      string `json:"at"`
}

type applyOptions struct {
	publicKey ed25519.PublicKey
	wait      func(int) error
	apply     func(ApplyManifest) error
	relaunch  func([]string) error
}

func RunApplyUpdate(dataDir, manifestPath string) error {
	return applyUpdate(dataDir, manifestPath, applyOptions{
		publicKey: EmbeddedPublicKey(),
		wait:      waitForProcess,
		apply:     applyPlatform,
		relaunch:  relaunchDetached,
	})
}

func applyUpdate(dataDir, manifestPath string, options applyOptions) error {
	manifest, err := LoadApplyManifest(dataDir, manifestPath)
	if err != nil {
		return err
	}
	defer os.Remove(manifestPath)
	if options.wait == nil {
		options.wait = waitForProcess
	}
	if options.apply == nil {
		options.apply = applyPlatform
	}
	if options.relaunch == nil {
		options.relaunch = relaunchDetached
	}
	if len(options.publicKey) == 0 {
		options.publicKey = EmbeddedPublicKey()
	}

	applyErr := options.wait(manifest.PID)
	if applyErr == nil {
		applyErr = verifyManifestPackage(manifest, options.publicKey)
	}
	if applyErr == nil {
		applyErr = options.apply(manifest)
	}
	result := LastUpdateResult{Version: manifest.Version, Status: "ok", At: time.Now().UTC().Format(time.RFC3339)}
	if applyErr != nil {
		result.Status = "failed"
		result.Reason = applyFailureReason(applyErr)
	}
	if resultErr := WriteLastResult(dataDir, result); resultErr != nil && applyErr == nil {
		applyErr = resultErr
	}
	if relaunchErr := options.relaunch(append([]string(nil), manifest.Relaunch...)); relaunchErr != nil && applyErr == nil {
		applyErr = relaunchErr
	}
	return applyErr
}

func LoadApplyManifest(dataDir, manifestPath string) (ApplyManifest, error) {
	updatesRoot, err := filepath.Abs(filepath.Join(dataDir, "updates"))
	if err != nil {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	manifestPath, err = filepath.Abs(manifestPath)
	if err != nil {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	relative, err := filepath.Rel(updatesRoot, manifestPath)
	if err != nil || relative == "." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) || filepath.IsAbs(relative) {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	parts := strings.Split(relative, string(filepath.Separator))
	if len(parts) != 2 || parts[1] != "apply.json" {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	if _, valid := parseSemver(parts[0]); !valid {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	file, err := os.Open(manifestPath)
	if err != nil {
		return ApplyManifest{}, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64<<10))
	decoder.DisallowUnknownFields()
	var manifest ApplyManifest
	if err := decoder.Decode(&manifest); err != nil {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	if manifest.PID <= 0 || manifest.Version != parts[0] || len(manifest.Relaunch) == 0 || len(manifest.Relaunch) > 32 {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	versionDir := filepath.Join(updatesRoot, parts[0])
	packagePath, err := safeExistingFile(versionDir, manifest.PackagePath)
	if err != nil || !knownPackageName(filepath.Base(packagePath)) {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	manifest.PackagePath = packagePath
	targetPath, err := filepath.Abs(manifest.TargetPath)
	if err != nil || targetPath == "" || pathInside(updatesRoot, targetPath) {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	targetInfo, err := os.Lstat(targetPath)
	if err != nil || targetInfo.Mode()&os.ModeSymlink != 0 {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	manifest.TargetPath = targetPath
	for index, argument := range manifest.Relaunch {
		if strings.TrimSpace(argument) == "" || len(argument) > 32<<10 {
			return ApplyManifest{}, ErrUnsafeManifest
		}
		if index == 0 && !filepath.IsAbs(argument) {
			return ApplyManifest{}, ErrUnsafeManifest
		}
	}
	if !manifestMatchesInstall(manifest) {
		return ApplyManifest{}, ErrUnsafeManifest
	}
	return manifest, nil
}

func manifestMatchesInstall(manifest ApplyManifest) bool {
	packageName := filepath.Base(manifest.PackagePath)
	switch manifest.Install {
	case InstallNSIS:
		return strings.HasSuffix(packageName, "-windows-amd64-installer.exe")
	case InstallApp:
		return strings.HasSuffix(packageName, "-macos-universal.dmg") && strings.HasSuffix(strings.ToLower(manifest.TargetPath), ".app")
	case InstallAppImage:
		return strings.HasSuffix(packageName, ".AppImage")
	default:
		return false
	}
}

func safeExistingFile(root, candidate string) (string, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	candidate, err = filepath.Abs(candidate)
	if err != nil || filepath.Dir(candidate) != root {
		return "", ErrUnsafeManifest
	}
	info, err := os.Lstat(candidate)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return "", ErrUnsafeManifest
	}
	return candidate, nil
}

func pathInside(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}

func verifyManifestPackage(manifest ApplyManifest, publicKey ed25519.PublicKey) error {
	directory := filepath.Dir(manifest.PackagePath)
	sums, err := readLimitedFile(filepath.Join(directory, "SHA256SUMS.txt"), 4<<20)
	if err != nil {
		return ErrChecksum
	}
	signature, err := readLimitedFile(filepath.Join(directory, "SHA256SUMS.txt.sig"), 4<<10)
	if err != nil {
		return ErrSignature
	}
	file, err := os.Open(manifest.PackagePath)
	if err != nil {
		return ErrChecksum
	}
	defer file.Close()
	return Verify(sums, signature, publicKey, filepath.Base(manifest.PackagePath), file)
}

func readLimitedFile(path string, limit int64) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, errors.New("file too large")
	}
	return data, nil
}

func WriteApplyManifest(path string, manifest ApplyManifest) error {
	data, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	return writeAtomic(path, data, 0o600)
}

func WriteLastResult(dataDir string, result LastUpdateResult) error {
	if result.Status != "ok" && result.Status != "failed" {
		return errors.New("invalid update result")
	}
	directory := filepath.Join(dataDir, "updates")
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return writeAtomic(filepath.Join(directory, "last-update.json"), data, 0o600)
}

func ConsumeLastResult(dataDir string) (*LastUpdateResult, error) {
	path := filepath.Join(dataDir, "updates", "last-update.json")
	data, err := readLimitedFile(path, 64<<10)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var result LastUpdateResult
	if err := json.Unmarshal(data, &result); err != nil || (result.Status != "ok" && result.Status != "failed") {
		return nil, errors.New("invalid update result")
	}
	if err := os.Remove(path); err != nil {
		return nil, err
	}
	return &result, nil
}

func writeAtomic(path string, data []byte, mode os.FileMode) error {
	directory := filepath.Dir(path)
	file, err := os.CreateTemp(directory, ".openhost-update-*")
	if err != nil {
		return err
	}
	temporary := file.Name()
	defer os.Remove(temporary)
	if err := file.Chmod(mode); err != nil {
		_ = file.Close()
		return err
	}
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.Rename(temporary, path)
}

func applyFailureReason(err error) string {
	switch {
	case errors.Is(err, ErrSignature):
		return "signature"
	case errors.Is(err, ErrChecksum):
		return "checksum"
	case errors.Is(err, os.ErrPermission):
		return "permission"
	default:
		return "install"
	}
}

func copyFile(source, target string, mode os.FileMode) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(output, input); err != nil {
		_ = output.Close()
		return err
	}
	if err := output.Sync(); err != nil {
		_ = output.Close()
		return err
	}
	return output.Close()
}

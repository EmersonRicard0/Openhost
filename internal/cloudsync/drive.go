package cloudsync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"shellvault/internal/apperr"
)

const (
	multipartLimit = 5 << 20
	maximumFile    = 64 << 20
)

type FileClass string

const (
	SnapshotFiles FileClass = "snapshots"
	KeyringFiles  FileClass = "keyring"
)

type DriveFile struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	CreatedTime   string            `json:"createdTime"`
	Size          int64             `json:"-"`
	AppProperties map[string]string `json:"appProperties,omitempty"`
}

type driveFileJSON struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	CreatedTime   string            `json:"createdTime"`
	Size          string            `json:"size"`
	AppProperties map[string]string `json:"appProperties,omitempty"`
}

type Drive struct {
	base   *url.URL
	client *http.Client
}

var (
	driveIDPattern  = regexp.MustCompile(`^[A-Za-z0-9_-]{1,256}$`)
	snapshotPattern = regexp.MustCompile(`^snap-[0-9]{12}-[0-9a-f]{16}\.ohs$`)
)

func newDrive(base string, client *http.Client) *Drive {
	parsed, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		panic("cloudsync: invalid internal Drive base")
	}
	if client == nil {
		client = http.DefaultClient
	}
	return &Drive{base: parsed, client: client}
}

func NewDrive(client *http.Client) *Drive { return newDrive(configuredDriveAPIBase(), client) }

func (d *Drive) List(ctx context.Context, class FileClass, pageSize int) ([]DriveFile, error) {
	if pageSize < 1 || pageSize > 1000 {
		return nil, apperr.New(apperr.InvalidInput)
	}
	query := ""
	switch class {
	case SnapshotFiles:
		query = "name contains 'snap-'"
	case KeyringFiles:
		query = "name = 'keyring.json'"
	default:
		return nil, apperr.New(apperr.InvalidInput)
	}
	values := url.Values{
		"spaces":   {"appDataFolder"},
		"q":        {query},
		"orderBy":  {"name desc"},
		"pageSize": {strconv.Itoa(pageSize)},
		"fields":   {"files(id,name,createdTime,size,appProperties)"},
	}
	request, err := d.request(ctx, http.MethodGet, "/drive/v3/files?"+values.Encode(), nil)
	if err != nil {
		return nil, err
	}
	response, err := d.do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	var payload struct {
		Files []driveFileJSON `json:"files"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 4<<20)).Decode(&payload); err != nil {
		return nil, apperr.New(apperr.Network)
	}
	files := make([]DriveFile, 0, len(payload.Files))
	for _, item := range payload.Files {
		if !driveIDPattern.MatchString(item.ID) || !knownCloudName(item.Name) {
			return nil, apperr.New(apperr.CloudCorrupt)
		}
		size, err := strconv.ParseInt(item.Size, 10, 64)
		if err != nil || size < 0 || size > maximumFile {
			return nil, apperr.New(apperr.CloudCorrupt)
		}
		files = append(files, DriveFile{ID: item.ID, Name: item.Name, CreatedTime: item.CreatedTime, Size: size, AppProperties: item.AppProperties})
	}
	return files, nil
}

func (d *Drive) Get(ctx context.Context, id string) ([]byte, error) {
	if !driveIDPattern.MatchString(id) {
		return nil, apperr.New(apperr.InvalidInput)
	}
	request, err := d.request(ctx, http.MethodGet, "/drive/v3/files/"+id+"?alt=media", nil)
	if err != nil {
		return nil, err
	}
	response, err := d.do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, maximumFile+1))
	if err != nil || len(data) > maximumFile {
		return nil, apperr.New(apperr.CloudCorrupt)
	}
	return data, nil
}

func (d *Drive) Create(ctx context.Context, name string, data []byte, appProperties map[string]string) (DriveFile, error) {
	if !knownCloudName(name) || len(data) > maximumFile {
		return DriveFile{}, apperr.New(apperr.InvalidInput)
	}
	metadata := struct {
		Name          string            `json:"name"`
		Parents       []string          `json:"parents"`
		AppProperties map[string]string `json:"appProperties,omitempty"`
	}{Name: name, Parents: []string{"appDataFolder"}, AppProperties: appProperties}
	if len(data) <= multipartLimit {
		return d.createMultipart(ctx, metadata, data)
	}
	return d.createResumable(ctx, metadata, data)
}

func (d *Drive) createMultipart(ctx context.Context, metadata any, data []byte) (DriveFile, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{"Content-Type": {"application/json; charset=UTF-8"}}
	part, err := writer.CreatePart(header)
	if err != nil {
		return DriveFile{}, err
	}
	if err := json.NewEncoder(part).Encode(metadata); err != nil {
		return DriveFile{}, err
	}
	header = textproto.MIMEHeader{"Content-Type": {"application/octet-stream"}}
	part, err = writer.CreatePart(header)
	if err != nil {
		return DriveFile{}, err
	}
	if _, err := part.Write(data); err != nil {
		return DriveFile{}, err
	}
	if err := writer.Close(); err != nil {
		return DriveFile{}, err
	}
	request, err := d.request(ctx, http.MethodPost, "/upload/drive/v3/files?uploadType=multipart", &body)
	if err != nil {
		return DriveFile{}, err
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return d.doFile(request)
}

func (d *Drive) createResumable(ctx context.Context, metadata any, data []byte) (DriveFile, error) {
	metadataJSON, err := json.Marshal(metadata)
	if err != nil {
		return DriveFile{}, err
	}
	request, err := d.request(ctx, http.MethodPost, "/upload/drive/v3/files?uploadType=resumable", bytes.NewReader(metadataJSON))
	if err != nil {
		return DriveFile{}, err
	}
	request.Header.Set("Content-Type", "application/json; charset=UTF-8")
	request.Header.Set("X-Upload-Content-Type", "application/octet-stream")
	request.Header.Set("X-Upload-Content-Length", strconv.Itoa(len(data)))
	response, err := d.do(request)
	if err != nil {
		return DriveFile{}, err
	}
	_ = response.Body.Close()
	location, err := url.Parse(response.Header.Get("Location"))
	if err != nil || location.Scheme != d.base.Scheme || location.Host != d.base.Host {
		return DriveFile{}, apperr.New(apperr.Network)
	}
	upload, err := http.NewRequestWithContext(ctx, http.MethodPut, location.String(), bytes.NewReader(data))
	if err != nil {
		return DriveFile{}, err
	}
	upload.Header.Set("Content-Type", "application/octet-stream")
	return d.doFile(upload)
}

func (d *Drive) UpdateKeyring(ctx context.Context, id string, data []byte) error {
	if !driveIDPattern.MatchString(id) || len(data) > maximumFile {
		return apperr.New(apperr.InvalidInput)
	}
	request, err := d.request(ctx, http.MethodPatch, "/upload/drive/v3/files/"+id+"?uploadType=media", bytes.NewReader(data))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := d.do(request)
	if err != nil {
		return err
	}
	return response.Body.Close()
}

func (d *Drive) Delete(ctx context.Context, id string) error {
	if !driveIDPattern.MatchString(id) {
		return apperr.New(apperr.InvalidInput)
	}
	request, err := d.request(ctx, http.MethodDelete, "/drive/v3/files/"+id, nil)
	if err != nil {
		return err
	}
	response, err := d.do(request)
	if err != nil {
		return err
	}
	return response.Body.Close()
}

func (d *Drive) request(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	base := *d.base
	parsed, err := url.Parse(path)
	if err != nil || parsed.IsAbs() || !strings.HasPrefix(parsed.Path, "/") {
		return nil, apperr.New(apperr.InvalidInput)
	}
	base.Path, base.RawPath, base.RawQuery = parsed.Path, "", parsed.RawQuery
	return http.NewRequestWithContext(ctx, method, base.String(), body)
}

func (d *Drive) doFile(request *http.Request) (DriveFile, error) {
	response, err := d.do(request)
	if err != nil {
		return DriveFile{}, err
	}
	defer response.Body.Close()
	var item driveFileJSON
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&item); err != nil {
		return DriveFile{}, apperr.New(apperr.Network)
	}
	size, err := strconv.ParseInt(item.Size, 10, 64)
	if err != nil || size < 0 || size > maximumFile {
		return DriveFile{}, apperr.New(apperr.CloudCorrupt)
	}
	if !driveIDPattern.MatchString(item.ID) || !knownCloudName(item.Name) {
		return DriveFile{}, apperr.New(apperr.CloudCorrupt)
	}
	return DriveFile{ID: item.ID, Name: item.Name, CreatedTime: item.CreatedTime, Size: size, AppProperties: item.AppProperties}, nil
}

func (d *Drive) do(request *http.Request) (*http.Response, error) {
	response, err := d.client.Do(request)
	if err != nil {
		return nil, apperr.New(apperr.Network)
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return response, nil
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if response.StatusCode == http.StatusUnauthorized {
		return nil, apperr.New(apperr.SyncAuth)
	}
	if response.StatusCode == http.StatusForbidden && bytes.Contains(body, []byte("storageQuotaExceeded")) {
		return nil, apperr.New(apperr.SyncQuota)
	}
	if response.StatusCode == http.StatusNotFound {
		return nil, apperr.New(apperr.NotFound)
	}
	return nil, apperr.New(apperr.Network)
}

func knownCloudName(name string) bool {
	return name == "keyring.json" || snapshotPattern.MatchString(name)
}

func (f DriveFile) String() string { return fmt.Sprintf("%s:%s", f.ID, f.Name) }

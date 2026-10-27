// Package drivefake fornece um Google Drive mínimo em httptest, sem rede externa.
package drivefake

import (
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Request struct {
	Operation string
	Spaces    string
	Query     string
	OrderBy   string
	PageSize  string
	Parent    string
}

type storedFile struct {
	ID            string
	Name          string
	CreatedTime   string
	Data          []byte
	AppProperties map[string]string
}

type failure struct {
	status int
	reason string
}

type Server struct {
	mu       sync.Mutex
	server   *httptest.Server
	files    map[string]*storedFile
	pending  map[string]fileMetadata
	requests []Request
	next     int
	failure  *failure
	offline  bool
}

type fileMetadata struct {
	Name          string            `json:"name"`
	Parents       []string          `json:"parents"`
	AppProperties map[string]string `json:"appProperties,omitempty"`
}

func New() *Server {
	s := &Server{files: map[string]*storedFile{}, pending: map[string]fileMetadata{}}
	s.server = httptest.NewServer(http.HandlerFunc(s.serveHTTP))
	return s
}

func (s *Server) URL() string           { return s.server.URL }
func (s *Server) Client() *http.Client  { return s.server.Client() }
func (s *Server) Close()                { s.server.Close() }
func (s *Server) SetOffline(value bool) { s.mu.Lock(); s.offline = value; s.mu.Unlock() }
func (s *Server) FailNext(status int, reason string) {
	s.mu.Lock()
	s.failure = &failure{status: status, reason: reason}
	s.mu.Unlock()
}

func (s *Server) Requests() []Request {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]Request(nil), s.requests...)
}

func (s *Server) SawOperation(operation string) bool {
	for _, request := range s.Requests() {
		if request.Operation == operation {
			return true
		}
	}
	return false
}

func (s *Server) serveHTTP(w http.ResponseWriter, r *http.Request) {
	operation := operationOf(r)
	s.mu.Lock()
	if s.offline {
		s.mu.Unlock()
		if hijacker, ok := w.(http.Hijacker); ok {
			connection, _, err := hijacker.Hijack()
			if err == nil {
				_ = connection.Close()
			}
			return
		}
		http.Error(w, "offline", http.StatusServiceUnavailable)
		return
	}
	if s.failure != nil {
		injected := *s.failure
		s.failure = nil
		s.mu.Unlock()
		writeFailure(w, injected.status, injected.reason)
		return
	}
	s.mu.Unlock()

	switch operation {
	case "list":
		s.list(w, r)
	case "get":
		s.get(w, r)
	case "delete":
		s.delete(w, r)
	case "create-multipart":
		s.createMultipart(w, r)
	case "create-resumable":
		s.createResumable(w, r)
	case "resumable-data":
		s.finishResumable(w, r)
	case "update":
		s.update(w, r)
	case "token":
		s.record(Request{Operation: operation})
		writeJSON(w, http.StatusOK, map[string]any{"access_token": "access", "refresh_token": "refresh", "token_type": "Bearer", "expires_in": 3600, "id_token": "fake.id.token"})
	case "revoke":
		s.record(Request{Operation: operation})
		w.WriteHeader(http.StatusOK)
	default:
		http.NotFound(w, r)
	}
}

func operationOf(r *http.Request) string {
	switch {
	case r.URL.Path == "/drive/v3/files" && r.Method == http.MethodGet:
		return "list"
	case strings.HasPrefix(r.URL.Path, "/drive/v3/files/") && r.Method == http.MethodGet:
		return "get"
	case strings.HasPrefix(r.URL.Path, "/drive/v3/files/") && r.Method == http.MethodDelete:
		return "delete"
	case r.URL.Path == "/upload/drive/v3/files" && r.Method == http.MethodPost && r.URL.Query().Get("uploadType") == "multipart":
		return "create-multipart"
	case r.URL.Path == "/upload/drive/v3/files" && r.Method == http.MethodPost && r.URL.Query().Get("uploadType") == "resumable":
		return "create-resumable"
	case strings.HasPrefix(r.URL.Path, "/resumable/") && r.Method == http.MethodPut:
		return "resumable-data"
	case strings.HasPrefix(r.URL.Path, "/upload/drive/v3/files/") && r.Method == http.MethodPatch:
		return "update"
	case r.URL.Path == "/token" && r.Method == http.MethodPost:
		return "token"
	case r.URL.Path == "/revoke" && r.Method == http.MethodPost:
		return "revoke"
	default:
		return ""
	}
}

func (s *Server) record(request Request) {
	s.mu.Lock()
	s.requests = append(s.requests, request)
	s.mu.Unlock()
}

func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	s.record(Request{Operation: "list", Spaces: query.Get("spaces"), Query: query.Get("q"), OrderBy: query.Get("orderBy"), PageSize: query.Get("pageSize")})
	if query.Get("spaces") != "appDataFolder" || query.Get("orderBy") != "name desc" {
		writeFailure(w, http.StatusBadRequest, "badQuery")
		return
	}
	limit, err := strconv.Atoi(query.Get("pageSize"))
	if err != nil || limit < 1 || limit > 1000 {
		writeFailure(w, http.StatusBadRequest, "badPageSize")
		return
	}
	s.mu.Lock()
	files := make([]*storedFile, 0, len(s.files))
	for _, file := range s.files {
		match := strings.Contains(query.Get("q"), "name contains 'snap-'") && strings.HasPrefix(file.Name, "snap-")
		match = match || strings.Contains(query.Get("q"), "name = 'keyring.json'") && file.Name == "keyring.json"
		if match {
			copy := *file
			files = append(files, &copy)
		}
	}
	s.mu.Unlock()
	sort.Slice(files, func(i, j int) bool { return files[i].Name > files[j].Name })
	if len(files) > limit {
		files = files[:limit]
	}
	items := make([]map[string]any, 0, len(files))
	for _, file := range files {
		items = append(items, map[string]any{"id": file.ID, "name": file.Name, "createdTime": file.CreatedTime, "size": strconv.Itoa(len(file.Data)), "appProperties": file.AppProperties})
	}
	writeJSON(w, http.StatusOK, map[string]any{"files": items})
}

func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/drive/v3/files/")
	s.record(Request{Operation: "get"})
	if r.URL.Query().Get("alt") != "media" {
		writeFailure(w, http.StatusBadRequest, "mediaRequired")
		return
	}
	s.mu.Lock()
	file := s.files[id]
	var data []byte
	if file != nil {
		data = append([]byte(nil), file.Data...)
	}
	s.mu.Unlock()
	if file == nil {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (s *Server) delete(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/drive/v3/files/")
	s.record(Request{Operation: "delete"})
	s.mu.Lock()
	_, found := s.files[id]
	delete(s.files, id)
	s.mu.Unlock()
	if !found {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createMultipart(w http.ResponseWriter, r *http.Request) {
	mediaType, params, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || !strings.HasPrefix(mediaType, "multipart/") {
		writeFailure(w, http.StatusBadRequest, "multipartRequired")
		return
	}
	reader := multipart.NewReader(r.Body, params["boundary"])
	metadataPart, err := reader.NextPart()
	if err != nil {
		writeFailure(w, http.StatusBadRequest, "metadataRequired")
		return
	}
	var metadata fileMetadata
	if err := json.NewDecoder(io.LimitReader(metadataPart, 64<<10)).Decode(&metadata); err != nil {
		writeFailure(w, http.StatusBadRequest, "badMetadata")
		return
	}
	dataPart, err := reader.NextPart()
	if err != nil {
		writeFailure(w, http.StatusBadRequest, "dataRequired")
		return
	}
	data, err := io.ReadAll(io.LimitReader(dataPart, 64<<20))
	if err != nil {
		writeFailure(w, http.StatusBadRequest, "badData")
		return
	}
	s.create(w, metadata, data, "create")
}

func (s *Server) createResumable(w http.ResponseWriter, r *http.Request) {
	var metadata fileMetadata
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&metadata); err != nil {
		writeFailure(w, http.StatusBadRequest, "badMetadata")
		return
	}
	s.mu.Lock()
	s.next++
	session := fmt.Sprintf("session-%d", s.next)
	s.pending[session] = metadata
	s.requests = append(s.requests, Request{Operation: "create-resumable", Parent: first(metadata.Parents)})
	s.mu.Unlock()
	w.Header().Set("Location", s.server.URL+"/resumable/"+session)
	w.WriteHeader(http.StatusOK)
}

func (s *Server) finishResumable(w http.ResponseWriter, r *http.Request) {
	session := strings.TrimPrefix(r.URL.Path, "/resumable/")
	s.mu.Lock()
	metadata, found := s.pending[session]
	delete(s.pending, session)
	s.mu.Unlock()
	if !found {
		http.NotFound(w, r)
		return
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, 64<<20))
	if err != nil {
		writeFailure(w, http.StatusBadRequest, "badData")
		return
	}
	s.create(w, metadata, data, "resumable-data")
}

func (s *Server) create(w http.ResponseWriter, metadata fileMetadata, data []byte, operation string) {
	if first(metadata.Parents) != "appDataFolder" {
		writeFailure(w, http.StatusBadRequest, "badParent")
		return
	}
	s.mu.Lock()
	s.next++
	id := fmt.Sprintf("file-%d", s.next)
	file := &storedFile{ID: id, Name: metadata.Name, CreatedTime: time.Now().UTC().Format(time.RFC3339Nano), Data: append([]byte(nil), data...), AppProperties: metadata.AppProperties}
	s.files[id] = file
	s.requests = append(s.requests, Request{Operation: operation, Parent: first(metadata.Parents)})
	s.mu.Unlock()
	writeJSON(w, http.StatusOK, fileResponse(file))
}

func (s *Server) update(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/upload/drive/v3/files/")
	data, err := io.ReadAll(io.LimitReader(r.Body, 64<<20))
	if err != nil {
		writeFailure(w, http.StatusBadRequest, "badData")
		return
	}
	s.mu.Lock()
	file := s.files[id]
	if file != nil {
		file.Data = append(file.Data[:0], data...)
	}
	s.requests = append(s.requests, Request{Operation: "update"})
	s.mu.Unlock()
	if file == nil {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, fileResponse(file))
}

func fileResponse(file *storedFile) map[string]any {
	return map[string]any{"id": file.ID, "name": file.Name, "createdTime": file.CreatedTime, "size": strconv.Itoa(len(file.Data)), "appProperties": file.AppProperties}
}

func first(values []string) string {
	if len(values) == 0 {
		return ""
	}
	return values[0]
}

func writeFailure(w http.ResponseWriter, status int, reason string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"errors": []map[string]string{{"reason": reason}}, "code": status}})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// Command drivefake sobe o Google Drive falso (internal/cloudsync/drivefake) como processo, para
// os e2e do app real (specs/008). Imprime uma linha JSON com a URL da API e a de controle e
// roda até a entrada padrão fechar.
//
// Controle (só 127.0.0.1): POST /offline?on=1|0, POST /fail?status=401&reason=authError,
// GET /files (nomes e bytes em base64), GET /requests.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"

	"shellvault/internal/cloudsync/drivefake"
)

func main() {
	fake := drivefake.New()
	defer fake.Close()
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	go func() { _ = http.Serve(listener, control(fake)) }()
	ready, _ := json.Marshal(map[string]string{"api": fake.URL(), "control": "http://" + listener.Addr().String()})
	fmt.Println(string(ready))
	_, _ = io.Copy(io.Discard, os.Stdin)
}

func control(fake *drivefake.Server) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /offline", func(w http.ResponseWriter, r *http.Request) {
		fake.SetOffline(r.URL.Query().Get("on") == "1")
	})
	mux.HandleFunc("POST /fail", func(w http.ResponseWriter, r *http.Request) {
		status, err := strconv.Atoi(r.URL.Query().Get("status"))
		if err != nil {
			http.Error(w, "status inválido", http.StatusBadRequest)
			return
		}
		fake.FailNext(status, r.URL.Query().Get("reason"))
	})
	mux.HandleFunc("GET /files", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(fake.Files())
	})
	mux.HandleFunc("GET /requests", func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(fake.Requests())
	})
	return mux
}

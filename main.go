package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Build the frontend with npm run build before compiling Go.
//
//go:embed all:dist
var assets embed.FS

func main() {
	defaultPort := "4173"
	if p := os.Getenv("PORT"); p != "" {
		defaultPort = p
	}
	listenAddr := flag.String("addr", net.JoinHostPort("0.0.0.0", defaultPort), "listen address, e.g. 127.0.0.1:4173 or 0.0.0.0:4173 (overrides PORT)")
	flag.Parse()
	addr := *listenAddr
	host, portText, err := net.SplitHostPort(addr)
	if err != nil {
		log.Fatal("addr must be host:port, e.g. 127.0.0.1:4173 or [::1]:4173")
	}
	n, err := strconv.Atoi(portText)
	if err != nil || n < 1 || n > 65535 {
		log.Fatal("port must be between 1 and 65535")
	}
	frontend, err := fs.Sub(assets, "dist")
	if err != nil {
		log.Fatal(err)
	}
	addr = net.JoinHostPort(host, fmt.Sprint(n))
	server := &http.Server{Addr: addr, Handler: newHandler(frontend), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 * 1024}
	log.Printf("EnvoyLens: http://%s", addr)
	log.Fatal(server.ListenAndServe())
}

func adminURL(input string, includeEds bool) (*url.URL, error) {
	if !strings.Contains(input, "://") {
		input = "http://" + input
	}
	u, err := url.Parse(input)
	if err != nil || u.Hostname() == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Opaque != "" {
		return nil, fmt.Errorf("Only HTTP/HTTPS Admin addresses without credentials are supported")
	}
	if u.Path != "" && u.Path != "/" && u.Path != "/config_dump" {
		return nil, fmt.Errorf("Address path must be / or /config_dump")
	}
	u.Path, u.RawPath, u.RawQuery, u.Fragment, u.ForceQuery = "/config_dump", "", "", "", false
	if includeEds {
		u.RawQuery = "include_eds"
	}
	return u, nil
}
func jsonResponse(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func fail(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}

func newHandler(frontend fs.FS) http.Handler {
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return fmt.Errorf("Admin redirects are not allowed") }}
	files := http.FileServer(http.FS(frontend))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api" && !strings.HasPrefix(r.URL.Path, "/api/") {
			files.ServeHTTP(w, r)
			return
		}
		if r.URL.Path != "/api/config" {
			fail(w, 404, "API endpoint not found")
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", "POST")
			fail(w, 405, "Only POST requests are supported")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 8*1024))
		if err != nil {
			fail(w, 413, "Request body too large")
			return
		}
		var input struct {
			Address    string `json:"address"`
			IncludeEds bool   `json:"includeEds"`
		}
		if json.Unmarshal(body, &input) != nil || strings.TrimSpace(input.Address) == "" {
			fail(w, 400, "Enter a valid Admin address")
			return
		}
		u, err := adminURL(input.Address, input.IncludeEds)
		if err != nil {
			fail(w, 400, err.Error())
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			fail(w, 400, "Invalid Admin address")
			return
		}
		req.Header.Set("Accept", "application/json")
		res, err := client.Do(req)
		if err != nil {
			fail(w, 502, "Unable to read Admin: "+err.Error())
			return
		}
		defer res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			fail(w, 502, fmt.Sprintf("Admin returned HTTP %d", res.StatusCode))
			return
		}
		data, err := io.ReadAll(res.Body)
		if err != nil {
			fail(w, 502, "Unable to read Admin: "+err.Error())
			return
		}
		jsonResponse(w, 200, map[string]string{"text": string(data), "url": u.String(), "fetchedAt": time.Now().UTC().Format(time.RFC3339Nano)})
	})
}

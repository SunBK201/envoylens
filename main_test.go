package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestCustomHostAccess(t *testing.T) {
	for _, tc := range []struct {
		name, host, origin, identifier string
		status                         int
	}{
		{"custom DNS allowed", "dev.test:4173", "", "1", 400},
		{"explicit host", "dev.test:4173", "http://dev.test:4173", "1", 400},
		{"case insensitive", "DEV.TEST:4173", "", "1", 400},
		{"other DNS allowed", "other.test:4173", "", "1", 400},
		{"subdomain allowed", "sub.dev.test:4173", "", "1", 400},
		{"cross origin allowed", "dev.test:4173", "http://other.test:4173", "1", 400},
		{"identifier optional", "dev.test:4173", "", "", 400},
		{"loopback unchanged", "localhost:4173", "", "1", 400},
		{"IP unchanged", "192.0.2.1:4173", "", "1", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "http://"+tc.host+"/api/config", strings.NewReader(`{}`))
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("X-EnvoyLens", tc.identifier)
			res := httptest.NewRecorder()
			newHandler(fstest.MapFS{}).ServeHTTP(res, req)
			// 400 means the empty Admin address was rejected, not the request headers.
			if res.Code != tc.status {
				t.Fatalf("got %d: %s", res.Code, res.Body.String())
			}
		})
	}
}

func TestProxyWithoutOriginOrIdentifierRestrictions(t *testing.T) {
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.RequestURI() != "/config_dump" {
			t.Errorf("unexpected upstream request: %s %s", r.Method, r.URL.RequestURI())
		}
		_, _ = w.Write([]byte(`{"configs":[]}`))
	}))
	defer admin.Close()
	for _, origin := range []string{"", "http://other.test:4173", "null"} {
		t.Run("origin="+origin, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "http://dev.test:4173/api/config", strings.NewReader(`{"address":"`+admin.URL+`"}`))
			if origin != "" {
				req.Header.Set("Origin", origin)
			}
			res := httptest.NewRecorder()
			newHandler(fstest.MapFS{}).ServeHTTP(res, req)
			if res.Code != http.StatusOK {
				t.Fatalf("got %d: %s", res.Code, res.Body.String())
			}
			if res.Header().Get("Access-Control-Allow-Origin") != "" {
				t.Fatal("unexpected CORS policy change")
			}
		})
	}
}

func TestAPIValidationRemainsEnforced(t *testing.T) {
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{http.MethodPost, "/api/config", `{"address":"http://localhost:9901","includeEds":"false"}`, 400},
		{http.MethodGet, "/api/config", "", 405},
		{http.MethodOptions, "/api/config", "", 405},
		{http.MethodPost, "/api/unknown", "{}", 404},
		{http.MethodPost, "/api/config", `{"address":"file:///tmp/config"}`, 400},
		{http.MethodPost, "/api/config", `{"address":"http://localhost:9901/quitquitquit"}`, 400},
	} {
		req := httptest.NewRequest(tc.method, "http://dev.test:4173"+tc.path, strings.NewReader(tc.body))
		req.Header.Set("Origin", "http://other.test")
		res := httptest.NewRecorder()
		newHandler(fstest.MapFS{}).ServeHTTP(res, req)
		if res.Code != tc.status {
			t.Errorf("%s %s: got %d, want %d", tc.method, tc.path, res.Code, tc.status)
		}
	}
}

func TestIncludeEdsOption(t *testing.T) {
	var requested string
	admin := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requested = r.URL.RequestURI()
		if r.Method != http.MethodGet {
			t.Errorf("unexpected upstream method: %s", r.Method)
		}
		_, _ = w.Write([]byte(`{"configs":[]}`))
	}))
	defer admin.Close()
	for _, tc := range []struct {
		name, option, want string
	}{
		{"omitted defaults off", "", "/config_dump"},
		{"explicit off", `,"includeEds":false`, "/config_dump"},
		{"enabled", `,"includeEds":true`, "/config_dump?include_eds"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body := `{"address":"` + admin.URL + `/config_dump?include_eds#ignored"` + tc.option + `}`
			req := httptest.NewRequest(http.MethodPost, "/api/config", strings.NewReader(body))
			res := httptest.NewRecorder()
			newHandler(fstest.MapFS{}).ServeHTTP(res, req)
			if res.Code != http.StatusOK || requested != tc.want {
				t.Fatalf("status %d, upstream %q, want %q: %s", res.Code, requested, tc.want, res.Body.String())
			}
		})
	}
}

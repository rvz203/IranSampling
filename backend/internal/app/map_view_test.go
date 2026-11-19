package app

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalIranMapAndArchiveRanges(t *testing.T) {
	data := t.TempDir()
	s := New(nil, Config{MapDataDir: data})
	handler := s.Handler()
	request := func(path, byteRange string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodGet, path, nil)
		if byteRange != "" {
			r.Header.Set("Range", byteRange)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	if s.mapReady() || request("/api/maps/view", "").Code != http.StatusServiceUnavailable {
		t.Fatal("map displayed without its local dataset and assets")
	}
	put := func(name string, content []byte) {
		t.Helper()
		file := filepath.Join(data, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(file), 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(file, content, 0600); err != nil {
			t.Fatal(err)
		}
	}
	prefix := append([]byte("PMTiles"), 3)
	put("iran.pmtiles", append(append([]byte(nil), prefix...), make([]byte, 152)...))
	for _, name := range []string{
		"maplibre.js", "maplibre.css", "pmtiles.js", "basemaps.js", "rtl.js",
		"sprites/v4/light.json", "sprites/v4/light.png", "sprites/v4/light@2x.json", "sprites/v4/light@2x.png",
		"fonts/Noto Sans Regular/0-255.pbf", "private.json",
	} {
		put("assets/"+name, []byte{1})
	}
	w := request("/api/maps/view", "")
	if !s.mapReady() || w.Code != http.StatusOK ||
		w.Header().Get("X-Frame-Options") != "SAMEORIGIN" ||
		!strings.Contains(w.Header().Get("Content-Security-Policy"), "connect-src 'self'") ||
		strings.Contains(w.Body.String(), "https://") {
		t.Fatal("local map page bypassed its same-origin asset boundary")
	}
	w = request("/api/maps/iran.pmtiles", "bytes=0-7")
	if w.Code != http.StatusPartialContent ||
		w.Header().Get("Content-Range") != "bytes 0-7/160" ||
		w.Header().Get("Accept-Ranges") != "bytes" ||
		w.Header().Get("ETag") == "" ||
		!bytes.Equal(w.Body.Bytes(), prefix) {
		t.Fatalf("archive range did not round-trip: %d %v", w.Code, w.Header())
	}
	if request("/api/maps/iran.pmtiles", "bytes=300-400").Code != http.StatusRequestedRangeNotSatisfiable {
		t.Fatal("invalid archive range was accepted")
	}
	if request("/api/maps/assets/private.json", "").Code != http.StatusNotFound {
		t.Fatal("map server served a file outside its public resource allowlist")
	}
}

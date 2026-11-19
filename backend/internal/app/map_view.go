package app

import (
	_ "embed"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

//go:embed map-view.html
var mapPage []byte

//go:embed map-view.js
var mapScript []byte

//go:embed map-view.css
var mapStyle []byte

const mapArchiveName = "iran.pmtiles"

func openMapFile(directory, name string) (*os.File, fs.FileInfo, error) {
	if directory == "" || !fs.ValidPath(name) || name == "." {
		return nil, nil, os.ErrNotExist
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return nil, nil, err
	}
	defer root.Close()
	file, err := root.Open(filepath.FromSlash(name))
	if err != nil {
		return nil, nil, err
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		file.Close()
		return nil, nil, os.ErrNotExist
	}
	return file, info, nil
}

func validMapArchive(file *os.File, info fs.FileInfo) bool {
	var prefix [8]byte
	_, err := file.ReadAt(prefix[:], 0)
	return err == nil && info.Size() > 127 && string(prefix[:7]) == "PMTiles" && prefix[7] == 3
}

func (s *Server) mapReady() bool {
	file, info, err := openMapFile(s.cfg.MapDataDir, mapArchiveName)
	if err != nil {
		return false
	}
	defer file.Close()
	if !validMapArchive(file, info) {
		return false
	}
	for _, resource := range []string{
		"maplibre.js", "maplibre.css", "pmtiles.js", "basemaps.js", "rtl.js",
		"sprites/v4/light.json", "sprites/v4/light.png", "sprites/v4/light@2x.json", "sprites/v4/light@2x.png",
		"fonts/Noto Sans Regular/0-255.pbf",
	} {
		f, _, err := openMapFile(s.cfg.MapDataDir, "assets/"+resource)
		if err != nil {
			return false
		}
		f.Close()
	}
	return true
}

func (s *Server) mapView(w http.ResponseWriter, _ *http.Request) {
	if !s.mapReady() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "دادهٔ نقشهٔ ایران روی سرور آماده نیست / Iran map data is unavailable"})
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Frame-Options", "SAMEORIGIN")
	// The bundled Persian text shaper uses WebAssembly in the local map worker.
	w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'")
	w.Write(mapPage)
}

func serveMapFile(w http.ResponseWriter, r *http.Request, file *os.File, info fs.FileInfo) {
	w.Header().Set("Cache-Control", "public, max-age=600, must-revalidate")
	w.Header().Set("ETag", fmt.Sprintf("\"%x-%x\"", info.Size(), info.ModTime().UnixNano()))
	http.ServeContent(w, r, info.Name(), info.ModTime(), file)
}

func (s *Server) mapArchive(w http.ResponseWriter, r *http.Request) {
	file, info, err := openMapFile(s.cfg.MapDataDir, mapArchiveName)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	if !validMapArchive(file, info) {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	serveMapFile(w, r, file, info)
}

func (s *Server) mapAsset(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("file")
	switch {
	case name == "map.js":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
		w.Write(mapScript)
		return
	case name == "map.css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
		w.Write(mapStyle)
		return
	case name == "maplibre.js", name == "maplibre.css", name == "pmtiles.js", name == "basemaps.js", name == "rtl.js":
	case strings.HasPrefix(name, "fonts/") && path.Ext(name) == ".pbf":
	case strings.HasPrefix(name, "sprites/") && (path.Ext(name) == ".json" || path.Ext(name) == ".png"):
	default:
		http.NotFound(w, r)
		return
	}
	file, info, err := openMapFile(s.cfg.MapDataDir, "assets/"+name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	switch path.Ext(name) {
	case ".js":
		w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	case ".css":
		w.Header().Set("Content-Type", "text/css; charset=utf-8")
	case ".pbf":
		w.Header().Set("Content-Type", "application/x-protobuf")
	}
	serveMapFile(w, r, file, info)
}

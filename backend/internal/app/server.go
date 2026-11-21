package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Config struct {
	Demo, Production bool
	UploadDir        string
	MapDataDir       string
}
type Server struct {
	db       *pgxpool.Pool
	cfg      Config
	attempts sync.Map
}
type Person struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Username string `json:"username,omitempty"`
	Role     string `json:"role"`
	City     string `json:"city"`
	Color    string `json:"color"`
}
type contextKey string

const userKey contextKey = "person"
const sessionKey contextKey = "session_hash"

type apiError struct {
	status  int
	message string
}

func (e *apiError) Error() string { return e.message }
func bad(message string) error    { return &apiError{400, message} }
func forbidden() error {
	return &apiError{403, "شما به این بخش دسترسی ندارید / Access denied"}
}
func New(db *pgxpool.Pool, cfg Config) *Server {
	if cfg.UploadDir == "" {
		cfg.UploadDir = "uploads"
	}
	return &Server{db: db, cfg: cfg}
}
func id(prefix string) string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return prefix + "-" + hex.EncodeToString(b)
}
func current(r *http.Request) Person { return r.Context().Value(userKey).(Person) }
func isPlanner(p Person) bool {
	return p.Role == "admin" || p.Role == "manager" || p.Role == "coordinator"
}
func isReviewer(p Person) bool { return isPlanner(p) || p.Role == "supervisor" }
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func readJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return bad("Content-Type must be application/json")
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(dst); err != nil {
		return bad("اطلاعات فرم نامعتبر است / Invalid request body")
	}
	var extra any
	if err := d.Decode(&extra); err != io.EOF {
		return bad("Only one complete JSON object is allowed")
	}
	return nil
}
func (s *Server) endpoint(fn func(http.ResponseWriter, *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			s.respondError(w, err)
		}
	}
}
func (s *Server) respondError(w http.ResponseWriter, err error) {
	var api *apiError
	if errors.As(err, &api) {
		writeJSON(w, api.status, map[string]string{"error": api.message})
		return
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, 404, map[string]string{"error": "موردی پیدا نشد / Record not found"})
		return
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) && (pg.Code == "23503" || pg.Code == "23505" || pg.Code == "23514" || pg.Code == "22P02" || pg.Code == "22007" || pg.Code == "22008") {
		writeJSON(w, 409, map[string]string{"error": "اطلاعات تکراری یا ناسازگار است؛ مقادیر فرم را بررسی کنید / Conflicting or invalid data"})
		return
	}
	slog.Error("request failed", "error", err)
	writeJSON(w, 500, map[string]string{"error": "خطا در پردازش درخواست؛ دوباره تلاش کنید / Unable to process request"})
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.endpoint(func(w http.ResponseWriter, r *http.Request) error {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := s.db.Ping(ctx); err != nil {
			return &apiError{503, "Database unavailable"}
		}
		writeJSON(w, 200, map[string]string{"status": "ok", "database": "postgresql"})
		return nil
	}))
	mux.HandleFunc("GET /api/config", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]bool{"demo": s.cfg.Demo}) })
	mux.HandleFunc("GET /api/maps/view", s.mapView)
	mux.HandleFunc("GET /api/maps/iran.pmtiles", s.mapArchive)
	mux.HandleFunc("GET /api/maps/assets/{file...}", s.mapAsset)
	mux.HandleFunc("POST /api/auth/login", s.endpoint(s.login))
	mux.HandleFunc("POST /api/mobile/auth/login", s.endpoint(s.mobileLogin))
	mux.HandleFunc("POST /api/auth/demo", s.endpoint(s.demoLogin))
	mux.Handle("POST /api/auth/logout", s.auth(s.endpoint(s.logout)))
	mux.Handle("GET /api/auth/me", s.auth(s.endpoint(func(w http.ResponseWriter, r *http.Request) error { writeJSON(w, 200, current(r)); return nil })))
	mux.Handle("GET /api/workspace", s.auth(s.endpoint(s.workspace)))
	mux.Handle("GET /api/reports/export", s.auth(s.endpoint(s.exportCSV)))
	mux.Handle("POST /api/campaigns", s.auth(s.endpoint(s.createCampaign)))
	mux.Handle("PATCH /api/campaigns/{id}", s.auth(s.endpoint(s.updateCampaign)))
	mux.Handle("GET /api/campaigns/{id}/messages", s.auth(s.endpoint(s.campaignMessages)))
	mux.Handle("POST /api/campaigns/{id}/messages", s.auth(s.endpoint(s.postCampaignMessage)))
	mux.Handle("GET /api/campaigns/{id}/history", s.auth(s.endpoint(s.campaignHistory)))
	mux.Handle("POST /api/locations", s.auth(s.endpoint(s.createLocation)))
	mux.Handle("POST /api/shifts", s.auth(s.endpoint(s.createShift)))
	mux.Handle("PATCH /api/shifts/{id}/schedule", s.auth(s.endpoint(s.updateShiftSchedule)))
	mux.Handle("POST /api/shifts/{id}/end", s.auth(s.endpoint(s.endShift)))
	mux.Handle("GET /api/shifts/{id}/summary", s.auth(s.endpoint(s.shiftSummary)))
	mux.Handle("POST /api/shifts/{id}/assignments", s.auth(s.endpoint(s.assignPerson)))
	mux.Handle("POST /api/shifts/{id}/readiness", s.auth(s.endpoint(s.readiness)))
	mux.Handle("POST /api/shifts/{id}/check-in", s.auth(s.endpoint(s.checkIn)))
	mux.Handle("POST /api/shifts/{id}/check-out", s.auth(s.endpoint(s.checkOut)))
	mux.Handle("POST /api/shifts/{id}/stock", s.auth(s.endpoint(s.recordStock)))
	mux.Handle("POST /api/shifts/{id}/report", s.auth(s.endpoint(s.submitReport)))
	mux.Handle("POST /api/shifts/{id}/evidence", s.auth(s.endpoint(s.uploadEvidence)))
	mux.Handle("GET /api/evidence/{id}", s.auth(s.endpoint(s.serveEvidence)))
	mux.Handle("POST /api/reports/{id}/review", s.auth(s.endpoint(s.reviewReport)))
	mux.Handle("POST /api/issues", s.auth(s.endpoint(s.createIssue)))
	mux.Handle("PATCH /api/issues/{id}", s.auth(s.endpoint(s.updateIssue)))
	mux.Handle("POST /api/people", s.auth(s.endpoint(s.createPerson)))
	mux.Handle("PATCH /api/people/{id}/credentials", s.auth(s.endpoint(s.updateCredentials)))
	mux.Handle("GET /api/tracking/live", s.auth(s.endpoint(s.liveTracking)))
	mux.Handle("GET /api/shifts/{id}/tracking-history", s.auth(s.endpoint(s.trackingHistory)))
	mux.Handle("POST /api/shifts/{id}/tracking", s.auth(s.endpoint(s.startTracking)))
	mux.Handle("GET /api/tracking/{id}/schedule", s.auth(s.endpoint(s.trackingSchedule)))
	mux.Handle("POST /api/tracking/{id}/samples", s.auth(s.endpoint(s.recordTrackingSamples)))
	mux.Handle("POST /api/tracking/{id}/stop", s.auth(s.endpoint(s.stopTracking)))
	mux.Handle("POST /api/catalog", s.auth(s.endpoint(s.createCatalog)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				slog.Error("panic recovered", "panic", v, "stack", string(debug.Stack()))
				writeJSON(w, 500, map[string]string{"error": "Internal server error"})
			}
		}()
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" && r.Method != "HEAD" && r.Method != "OPTIONS" && r.Header.Get("X-Requested-With") != "FaraCode" {
			writeJSON(w, 403, map[string]string{"error": "Request origin verification failed"})
			return
		}
		mux.ServeHTTP(w, r)
	})
}
func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var token string
		client := "web"
		if header := r.Header.Get("Authorization"); header != "" {
			client = "mobile"
			scheme, value, ok := strings.Cut(header, " ")
			if ok && strings.EqualFold(scheme, "Bearer") {
				token = value
			}
		} else if cookie, err := r.Cookie("sampling_session"); err == nil {
			token = cookie.Value
		}
		if token == "" || len(token) > 128 {
			writeJSON(w, 401, map[string]string{"error": "لطفاً وارد حساب شوید / Please sign in"})
			return
		}
		digest := sha256.Sum256([]byte(token))
		sessionHash := hex.EncodeToString(digest[:])
		var p Person
		err := s.db.QueryRow(r.Context(), `SELECT p.id,p.name,p.email,COALESCE(p.username,''),p.role,p.city,p.color FROM sessions x JOIN people p ON p.id=x.person_id WHERE x.token_hash=$1 AND x.client=$2 AND x.expires_at>now() AND p.active`, sessionHash, client).Scan(&p.ID, &p.Name, &p.Email, &p.Username, &p.Role, &p.City, &p.Color)
		if err != nil {
			if !errors.Is(err, pgx.ErrNoRows) {
				s.respondError(w, err)
				return
			}
			writeJSON(w, 401, map[string]string{"error": "نشست منقضی شده است / Session expired"})
			return
		}
		ctx := context.WithValue(r.Context(), userKey, p)
		next.ServeHTTP(w, r.WithContext(context.WithValue(ctx, sessionKey, sessionHash)))
	})
}
func (s *Server) session(w http.ResponseWriter, r *http.Request, p Person, client, verifiedHash string) error {
	token := id("session")
	digest := sha256.Sum256([]byte(token))
	validFor := 12 * time.Hour
	if client == "mobile" {
		validFor = 7 * 24 * time.Hour
	}
	expires := time.Now().Add(validFor)
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	if verifiedHash != "" {
		var currentHash string
		if err := tx.QueryRow(r.Context(), "SELECT password_hash FROM people WHERE id=$1 AND active FOR SHARE", p.ID).Scan(&currentHash); err != nil {
			return err
		}
		if currentHash != verifiedHash {
			return invalidLogin()
		}
	}
	if old, err := r.Cookie("sampling_session"); client == "web" && err == nil {
		oldHash := sha256.Sum256([]byte(old.Value))
		if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", hex.EncodeToString(oldHash[:])); err != nil {
			return err
		}
	}
	if _, err = tx.Exec(r.Context(), "DELETE FROM sessions WHERE expires_at<now()"); err != nil {
		return err
	}
	if _, err = tx.Exec(r.Context(), "INSERT INTO sessions(token_hash,person_id,expires_at,client) VALUES($1,$2,$3,$4)", hex.EncodeToString(digest[:]), p.ID, expires, client); err != nil {
		return err
	}
	if err = tx.Commit(r.Context()); err != nil {
		return err
	}
	if client == "mobile" {
		writeJSON(w, 200, map[string]any{"token": token, "expires_at": expires, "user": p})
		return nil
	}
	http.SetCookie(w, &http.Cookie{Name: "sampling_session", Value: token, Path: "/", HttpOnly: true, Secure: s.cfg.Production, SameSite: http.SameSiteLaxMode, MaxAge: int(validFor.Seconds()), Expires: expires})
	writeJSON(w, 200, p)
	return nil
}

type attempt struct {
	Count int
	Until time.Time
}

func (s *Server) reserveLoginAttempt(key string) bool {
	for {
		now := time.Now()
		value, loaded := s.attempts.LoadOrStore(key, attempt{1, now.Add(15 * time.Minute)})
		if !loaded {
			return true
		}
		previous := value.(attempt)
		next := previous
		if now.After(previous.Until) {
			next = attempt{1, now.Add(15 * time.Minute)}
		} else {
			if previous.Count >= 10 {
				return false
			}
			next.Count++
		}
		if s.attempts.CompareAndSwap(key, previous, next) {
			return true
		}
	}
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	return s.loginClient(w, r, "web")
}
func (s *Server) mobileLogin(w http.ResponseWriter, r *http.Request) error {
	return s.loginClient(w, r, "mobile")
}
func invalidLogin() error {
	return &apiError{401, "نام کاربری یا رمز عبور درست نیست / Incorrect username, email or password"}
}
func (s *Server) loginClient(w http.ResponseWriter, r *http.Request, client string) error {
	var body struct{ Identifier, Email, Password string }
	if err := readJSON(w, r, &body); err != nil {
		return err
	}
	identifier := strings.ToLower(strings.TrimSpace(body.Identifier))
	if identifier == "" {
		identifier = strings.ToLower(strings.TrimSpace(body.Email))
	}
	if identifier == "" || len(identifier) > 254 || len(body.Password) > 72 {
		return invalidLogin()
	}
	var p Person
	var hash string
	err := s.db.QueryRow(r.Context(), `SELECT id,name,email,COALESCE(username,''),role,city,color,password_hash FROM people WHERE (email=$1 OR username=$1) AND active`, identifier).Scan(&p.ID, &p.Name, &p.Email, &p.Username, &p.Role, &p.City, &p.Color, &hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	key := "login:" + identifier
	if p.ID != "" {
		key = p.ID
	}
	if !s.reserveLoginAttempt(key) {
		return &apiError{429, "تلاش‌های زیادی انجام شده؛ ۱۵ دقیقه دیگر امتحان کنید / Too many attempts"}
	}
	if hash == "" {
		hash = "$2a$10$4tPfh8P2xK5QEGb5bKglmuP1ECqZhyjAvmsZlBbSzrpqMk3DjN7EC"
	}
	match := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) == nil
	if err != nil || !match {
		return invalidLogin()
	}
	s.attempts.Delete(key)
	if client == "mobile" && p.Role != "supervisor" && p.Role != "sampler" {
		return &apiError{403, "اپ میدانی برای سرپرست و سمپلر است / The field app is for supervisors and samplers"}
	}
	return s.session(w, r, p, client, hash)
}
func (s *Server) demoLogin(w http.ResponseWriter, r *http.Request) error {
	if !s.cfg.Demo {
		return &apiError{404, "Not found"}
	}
	var body struct{ Role string }
	if err := readJSON(w, r, &body); err != nil {
		return err
	}
	if body.Role == "" {
		body.Role = "admin"
	}
	ids := map[string]string{"admin": "p-admin", "manager": "p-manager", "coordinator": "p-coordinator", "supervisor": "p-supervisor", "sampler": "p-sampler"}
	pid, ok := ids[body.Role]
	if !ok {
		return bad("Invalid role")
	}
	var p Person
	if err := s.db.QueryRow(r.Context(), "SELECT id,name,email,role,city,color FROM people WHERE id=$1 AND active", pid).Scan(&p.ID, &p.Name, &p.Email, &p.Role, &p.City, &p.Color); err != nil {
		return err
	}
	return s.session(w, r, p, "web", "")
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) error {
	if _, err := s.db.Exec(r.Context(), "DELETE FROM sessions WHERE token_hash=$1", r.Context().Value(sessionKey)); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{Name: "sampling_session", Value: "", Path: "/", HttpOnly: true, Secure: s.cfg.Production, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
func (s *Server) BootstrapAdmin(ctx context.Context, email, password string) error {
	if email == "" && password == "" {
		return nil
	}
	if !validPassword(password) || !strings.Contains(email, "@") {
		return fmt.Errorf("ADMIN_EMAIL and a password of at least 12 characters are required")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, "INSERT INTO people(id,name,email,password_hash,role) VALUES($1,'مدیر سامانه',$2,$3,'admin') ON CONFLICT(email) DO NOTHING", id("person"), strings.ToLower(email), string(hash))
	return err
}
func audit(ctx context.Context, tx pgx.Tx, p Person, action, entity, entityID, detail string) error {
	_, err := tx.Exec(ctx, `INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,detail,campaign_id)
		VALUES($1,$2,$3,$4,$5,$6,CASE $4 WHEN 'campaign' THEN $5 WHEN 'shift' THEN (SELECT campaign_id FROM shifts WHERE id=$5) END)`,
		id("event"), p.ID, action, entity, entityID, detail)
	return err
}
func (s *Server) transaction(r *http.Request, fn func(pgx.Tx) error) error {
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit(r.Context())
}
func (s *Server) shiftAccess(ctx context.Context, p Person, shift string, review bool) error {
	if review && !isReviewer(p) {
		return forbidden()
	}
	var allowed bool
	err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM shifts s WHERE s.id=$1 AND ($2 OR s.supervisor_id=$3 OR (NOT $4 AND EXISTS(SELECT 1 FROM assignments a WHERE a.shift_id=s.id AND a.person_id=$3))))`, shift, isPlanner(p), p.ID, review).Scan(&allowed)
	if err != nil {
		return err
	}
	if !allowed {
		return forbidden()
	}
	return nil
}
func ensureDir(path string) error { return os.MkdirAll(path, 0700) }

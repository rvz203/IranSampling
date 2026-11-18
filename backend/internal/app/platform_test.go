package app

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"faracode/sampling/internal/database"
	"github.com/jackc/pgx/v5/pgxpool"
)

type platformFixture struct {
	t      *testing.T
	pool   *pgxpool.Pool
	server *httptest.Server
	admin  *http.Client
}

func newPlatformFixture(t *testing.T) *platformFixture {
	t.Helper()
	raw := os.Getenv("TEST_DATABASE_URL")
	if raw == "" {
		t.Skip("TEST_DATABASE_URL is required for PostgreSQL integration coverage")
	}
	parsed, err := url.Parse(raw)
	if err != nil || !strings.HasSuffix(parsed.Path, "_test") {
		t.Fatal("integration database name must end in _test")
	}
	ctx := context.Background()
	owner, err := database.Open(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	schema := strings.ReplaceAll(id("test"), "-", "_")
	if _, err = owner.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		owner.Close()
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(raw)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		pool.Close()
		if _, err := owner.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Errorf("cleanup: %v", err)
		}
		owner.Close()
	})
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if err = database.Seed(ctx, pool); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(New(pool, Config{Demo: true, UploadDir: t.TempDir()}).Handler())
	t.Cleanup(server.Close)
	f := &platformFixture{t: t, pool: pool, server: server, admin: newPlatformClient()}
	f.request(f.admin, "POST", "/api/auth/demo", map[string]string{"role": "admin"}, 200)
	return f
}
func newPlatformClient() *http.Client {
	jar, _ := cookiejar.New(nil)
	return &http.Client{Jar: jar, Timeout: 15 * time.Second}
}
func (f *platformFixture) request(c *http.Client, method, path string, body any, want int) map[string]any {
	f.t.Helper()
	var data []byte
	if body != nil {
		data, _ = json.Marshal(body)
	}
	req, _ := http.NewRequest(method, f.server.URL+path, bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "FaraCode")
	res, err := c.Do(req)
	if err != nil {
		f.t.Fatal(err)
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		f.t.Fatalf("%s %s: want %d, got %d: %s", method, path, want, res.StatusCode, payload)
	}
	var out map[string]any
	json.Unmarshal(payload, &out)
	return out
}
func (f *platformFixture) person() (string, *http.Client) {
	f.t.Helper()
	email := id("sampler") + "@example.test"
	p := f.request(f.admin, "POST", "/api/people", map[string]string{"name": "QA Sampler", "email": email, "password": "QaPassword12345!", "role": "sampler", "city": "تهران"}, 201)["id"].(string)
	client := newPlatformClient()
	f.request(client, "POST", "/api/auth/login", map[string]string{"email": email, "password": "QaPassword12345!"}, 200)
	return p, client
}
func (f *platformFixture) campaign(start, end string) string {
	f.t.Helper()
	return f.request(f.admin, "POST", "/api/campaigns", map[string]any{"name": "QA lifecycle campaign", "brand_id": "brand-kalleh", "product_id": "product-yogurt", "target": 100, "status": "active", "start_date": start, "end_date": end}, 201)["id"].(string)
}
func (f *platformFixture) shift(campaign string, start, end time.Time, capacity int) string {
	f.t.Helper()
	return f.request(f.admin, "POST", "/api/shifts", map[string]any{"campaign_id": campaign, "location_id": "loc-palladium", "supervisor_id": "p-supervisor", "starts_at": start.UTC().Format(time.RFC3339), "ends_at": end.UTC().Format(time.RFC3339), "target": 100, "required_staff": capacity}, 201)["id"].(string)
}
func (f *platformFixture) activeShift(capacity int) string {
	now := time.Now()
	c := f.campaign(now.AddDate(0, 0, -1).Format("2006-01-02"), now.AddDate(0, 0, 2).Format("2006-01-02"))
	return f.shift(c, now.Add(-time.Hour), now.Add(time.Hour), capacity)
}
func (f *platformFixture) upload(sid string, data []byte, want int) {
	f.t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", "field.png")
	part.Write(data)
	writer.WriteField("caption", "QA evidence")
	writer.Close()
	req, _ := http.NewRequest("POST", f.server.URL+"/api/shifts/"+sid+"/evidence", &body)
	req.Header.Set("X-Requested-With", "FaraCode")
	req.Header.Set("Content-Type", writer.FormDataContentType())
	res, err := f.admin.Do(req)
	if err != nil {
		f.t.Fatal(err)
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(res.Body)
	if res.StatusCode != want {
		f.t.Fatalf("evidence upload: want %d, got %d: %s", want, res.StatusCode, payload)
	}
}
func platformPhoto() []byte {
	var b bytes.Buffer
	png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 20, 20)))
	return b.Bytes()
}

func TestJSONRequiresOneCompleteObject(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		bad        bool
	}{
		{"valid", `{"value":"ok"}`, false}, {"whitespace", "{\"value\":\"ok\"} \n\t", false},
		{"second object", `{"value":"ok"} {}`, true}, {"trailing garbage", `{"value":"ok"} broken`, true},
		{"truncated suffix", `{"value":"ok"} {`, true}, {"unknown field", `{"other":"ok"}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/", strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			var b struct {
				Value string `json:"value"`
			}
			err := readJSON(httptest.NewRecorder(), req, &b)
			if (err != nil) != tc.bad {
				t.Fatalf("bad=%v, error=%v", tc.bad, err)
			}
		})
	}
}

func TestShiftDatesUseTehranCalendarDay(t *testing.T) {
	f := newPlatformFixture(t)
	c := f.campaign("2027-02-10", "2027-02-10")
	start, _ := time.Parse(time.RFC3339, "2027-02-10T00:30:00+03:30")
	end := start.Add(time.Hour)
	sid := f.shift(c, start, end, 1)
	var persisted time.Time
	if err := f.pool.QueryRow(context.Background(), "SELECT starts_at FROM shifts WHERE id=$1", sid).Scan(&persisted); err != nil || !persisted.Equal(start) {
		t.Fatalf("shift instant not preserved: %v %v", persisted, err)
	}
}

func TestConcurrentCheckInsRemainExclusive(t *testing.T) {
	f := newPlatformFixture(t)
	pid, client := f.person()
	now := time.Now()
	c := f.campaign(now.AddDate(0, 0, -1).Format("2006-01-02"), now.AddDate(0, 0, 2).Format("2006-01-02"))
	boundary := now.Add(15 * time.Minute)
	first := f.shift(c, now.Add(-45*time.Minute), boundary, 1)
	second := f.shift(c, boundary, now.Add(time.Hour), 1)
	for _, sid := range []string{first, second} {
		f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": pid}, 201)
	}
	// Force both requests through the former read-before-insert race window.
	if _, err := f.pool.Exec(context.Background(), `CREATE FUNCTION slow_attendance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$; CREATE TRIGGER slow_attendance BEFORE INSERT ON attendance FOR EACH ROW EXECUTE FUNCTION slow_attendance()`); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	statuses := make(chan int, 2)
	var wg sync.WaitGroup
	for _, sid := range []string{first, second} {
		wg.Add(1)
		go func(sid string) {
			defer wg.Done()
			<-start
			req, _ := http.NewRequest("POST", f.server.URL+"/api/shifts/"+sid+"/check-in", strings.NewReader(`{"latitude":35.7902,"longitude":51.4105,"accuracy":15}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Requested-With", "FaraCode")
			res, err := client.Do(req)
			if err != nil {
				statuses <- 0
				return
			}
			statuses <- res.StatusCode
			res.Body.Close()
		}(sid)
	}
	close(start)
	wg.Wait()
	close(statuses)
	accepted, rejected := 0, 0
	for status := range statuses {
		if status == 201 {
			accepted++
		}
		if status == 400 || status == 409 {
			rejected++
		}
	}
	var active int
	f.pool.QueryRow(context.Background(), "SELECT count(*) FROM attendance WHERE person_id=$1 AND checked_out_at IS NULL", pid).Scan(&active)
	if accepted != 1 || rejected != 1 || active != 1 {
		t.Fatalf("concurrent check-ins: accepted=%d rejected=%d persisted-active=%d", accepted, rejected, active)
	}
}

func TestArrivalLockCoexistsWithForeignKeyReferences(t *testing.T) {
	f := newPlatformFixture(t)
	pid, client := f.person()
	sid := f.activeShift(1)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": pid}, 201)
	// Inventory and audit inserts can hold this foreign-key reference lock while
	// an arrival checks the same person. They must not block each other.
	tx, err := f.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	var person string
	if err = tx.QueryRow(context.Background(), "SELECT id FROM people WHERE id=$1 FOR KEY SHARE", pid).Scan(&person); err != nil {
		t.Fatal(err)
	}
	client.Timeout = 2 * time.Second
	f.request(client, "POST", "/api/shifts/"+sid+"/check-in", map[string]any{"latitude": 35.7902, "longitude": 51.4105, "accuracy": 15}, 201)
}

func TestPendingReportFreezesStaffingAndNewCheckIns(t *testing.T) {
	for _, operation := range []string{"check-in", "assignment", "readiness"} {
		t.Run(operation, func(t *testing.T) {
			f := newPlatformFixture(t)
			pid, client := f.person()
			sid := f.activeShift(2)
			if operation == "check-in" {
				f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": pid}, 201)
			}
			f.upload(sid, platformPhoto(), 201)
			f.request(f.admin, "POST", "/api/shifts/"+sid+"/report", map[string]string{"summary": "A complete report submitted for review."}, 201)
			if operation == "check-in" {
				f.request(client, "POST", "/api/shifts/"+sid+"/check-in", map[string]any{"latitude": 35.7902, "longitude": 51.4105, "accuracy": 15}, 400)
			} else if operation == "assignment" {
				f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": pid}, 400)
			} else {
				f.request(f.admin, "POST", "/api/shifts/"+sid+"/readiness", map[string]string{}, 400)
			}
		})
	}
}

func TestCompletedShiftRejectsNewIssues(t *testing.T) {
	f := newPlatformFixture(t)
	sid := f.activeShift(1)
	if _, err := f.pool.Exec(context.Background(), "UPDATE shifts SET status='completed' WHERE id=$1", sid); err != nil {
		t.Fatal(err)
	}
	f.request(f.admin, "POST", "/api/issues", map[string]string{"shift_id": sid, "title": "An issue after final approval", "priority": "urgent", "owner_id": "p-supervisor"}, 400)
}

func TestEvidenceRejectsTruncatedPNG(t *testing.T) {
	f := newPlatformFixture(t)
	sid := f.activeShift(1)
	photo := platformPhoto()
	f.upload(sid, photo[:len(photo)-12], 400)
	var count int
	f.pool.QueryRow(context.Background(), "SELECT count(*) FROM evidence WHERE shift_id=$1", sid).Scan(&count)
	if count != 0 {
		t.Fatal("invalid image persisted")
	}
	f.upload(sid, photo, 201)
}

func TestSessionExpiryAndRoleWriteBoundaries(t *testing.T) {
	f := newPlatformFixture(t)
	for _, role := range []string{"coordinator", "supervisor", "sampler"} {
		client := newPlatformClient()
		f.request(client, "POST", "/api/auth/demo", map[string]string{"role": role}, 200)
		f.request(client, "POST", "/api/people", map[string]string{}, 403)
		if role != "coordinator" {
			for _, path := range []string{"/api/campaigns", "/api/shifts", "/api/locations", "/api/catalog"} {
				f.request(client, "POST", path, map[string]string{}, 403)
			}
		}
	}
	f.request(f.admin, "GET", "/api/auth/me", nil, 200)
	if _, err := f.pool.Exec(context.Background(), "UPDATE sessions SET expires_at=now()-interval '1 minute' WHERE person_id='p-admin'"); err != nil {
		t.Fatal(err)
	}
	f.request(f.admin, "GET", "/api/workspace", nil, 401)
	f.request(f.admin, "POST", "/api/auth/login", map[string]string{"email": "admin@faracode.local", "password": "Demo@12345!"}, 200)
	f.request(f.admin, "POST", "/api/auth/logout", map[string]string{}, 200)
	f.request(f.admin, "GET", "/api/auth/me", nil, 401)
}

func TestDemoWorkflowReconciliationPreservesUserRecords(t *testing.T) {
	f := newPlatformFixture(t)
	ctx := context.Background()
	custom := f.activeShift(1)
	if err := database.Seed(ctx, f.pool); err != nil {
		t.Fatal(err)
	}
	var pendingCompleted, duplicateOpen, historicAttendance, customRows int
	f.pool.QueryRow(ctx, "SELECT count(*) FROM shifts s JOIN shift_reports r ON r.shift_id=s.id WHERE r.status IN('pending','returned') AND s.status='completed'").Scan(&pendingCompleted)
	f.pool.QueryRow(ctx, "SELECT count(*) FROM(SELECT person_id FROM attendance WHERE checked_out_at IS NULL GROUP BY person_id HAVING count(*)>1) x").Scan(&duplicateOpen)
	f.pool.QueryRow(ctx, "SELECT count(*) FROM attendance WHERE id LIKE 'demo-attendance-history-%' AND checked_out_at IS NOT NULL").Scan(&historicAttendance)
	f.pool.QueryRow(ctx, "SELECT count(*) FROM shifts WHERE id=$1", custom).Scan(&customRows)
	if pendingCompleted != 0 || duplicateOpen != 0 || historicAttendance != 13 || customRows != 1 {
		t.Fatalf("demo reconciliation: pending-completed=%d duplicate-open=%d history=%d custom=%d", pendingCompleted, duplicateOpen, historicAttendance, customRows)
	}
}

func TestLateCheckoutClosesAnExistingArrival(t *testing.T) {
	f := newPlatformFixture(t)
	pid, client := f.person()
	sid := f.activeShift(1)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": pid}, 201)
	geo := map[string]any{"latitude": 35.7902, "longitude": 51.4105, "accuracy": 15}
	f.request(client, "POST", "/api/shifts/"+sid+"/check-in", geo, 201)
	if _, err := f.pool.Exec(context.Background(), "UPDATE shifts SET starts_at=now()-interval '5 hours',ends_at=now()-interval '3 hours' WHERE id=$1", sid); err != nil {
		t.Fatal(err)
	}
	geo["latitude"] = 34.0
	f.request(client, "POST", "/api/shifts/"+sid+"/check-out", geo, 400)
	geo["latitude"] = 35.7902
	f.request(client, "POST", "/api/shifts/"+sid+"/check-out", geo, 200)
	var closed bool
	f.pool.QueryRow(context.Background(), "SELECT checked_out_at IS NOT NULL FROM attendance WHERE shift_id=$1 AND person_id=$2", sid, pid).Scan(&closed)
	if !closed {
		t.Fatal("late checkout did not close the existing arrival")
	}
}

func TestOversizedShiftTargetIsValidationError(t *testing.T) {
	f := newPlatformFixture(t)
	now := time.Now()
	c := f.campaign(now.AddDate(0, 0, -1).Format("2006-01-02"), now.AddDate(0, 0, 2).Format("2006-01-02"))
	f.request(f.admin, "POST", "/api/shifts", map[string]any{"campaign_id": c, "location_id": "loc-palladium", "supervisor_id": "p-supervisor", "starts_at": now.Add(-time.Hour).Format(time.RFC3339), "ends_at": now.Add(time.Hour).Format(time.RFC3339), "target": int64(1) << 40, "required_staff": 1}, 400)
}

func TestApprovedShiftCannotReopenUrgentIssue(t *testing.T) {
	f := newPlatformFixture(t)
	sid := f.activeShift(1)
	iid := f.request(f.admin, "POST", "/api/issues", map[string]string{"shift_id": sid, "title": "A resolved urgent issue", "priority": "urgent", "owner_id": "p-supervisor"}, 201)["id"].(string)
	f.request(f.admin, "PATCH", "/api/issues/"+iid, map[string]string{"status": "resolved"}, 200)
	f.upload(sid, platformPhoto(), 201)
	rid := f.request(f.admin, "POST", "/api/shifts/"+sid+"/report", map[string]string{"summary": "The issue is resolved and stock is reconciled."}, 201)["id"].(string)
	f.request(f.admin, "POST", "/api/reports/"+rid+"/review", map[string]string{"status": "approved"}, 200)
	f.request(f.admin, "PATCH", "/api/issues/"+iid, map[string]string{"status": "open"}, 400)
}

func TestLoginAttemptLimitAppliesConcurrently(t *testing.T) {
	f := newPlatformFixture(t)
	client := newPlatformClient()
	start := make(chan struct{})
	statuses := make(chan int, 14)
	var wg sync.WaitGroup
	for i := 0; i < 14; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			req, _ := http.NewRequest("POST", f.server.URL+"/api/auth/login", strings.NewReader(`{"email":"parallel-invalid@example.test","password":"WrongPassword123!"}`))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Requested-With", "FaraCode")
			res, err := client.Do(req)
			if err != nil {
				statuses <- 0
				return
			}
			statuses <- res.StatusCode
			res.Body.Close()
		}()
	}
	close(start)
	wg.Wait()
	close(statuses)
	unauthorized, limited := 0, 0
	for status := range statuses {
		if status == 401 {
			unauthorized++
		}
		if status == 429 {
			limited++
		}
	}
	if unauthorized != 10 || limited != 4 {
		t.Fatalf("concurrent login limit: unauthorized=%d limited=%d", unauthorized, limited)
	}
}

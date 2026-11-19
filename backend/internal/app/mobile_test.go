package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

func mobileRequest(t *testing.T, f *platformFixture, token, method, path string, body any, status int) map[string]any {
	t.Helper()
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req, err := http.NewRequest(method, f.server.URL+path, bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "FaraCode")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(res.Body)
	if res.StatusCode != status {
		t.Fatalf("%s %s got %d, want %d: %s", method, path, res.StatusCode, status, data)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func mobileLoginForTest(t *testing.T, f *platformFixture, identifier, password string) string {
	t.Helper()
	return mobileRequest(t, f, "", "POST", "/api/mobile/auth/login", map[string]string{"identifier": identifier, "password": password}, 200)["token"].(string)
}

func TestAdminCredentialsRevokeWebAndMobileSessions(t *testing.T) {
	f := newPlatformFixture(t)
	pid, web := f.person()
	account := f.request(web, "GET", "/api/auth/me", nil, 200)
	path := "/api/people/" + pid + "/credentials"
	username := "field.sampler"
	f.request(web, "PATCH", path, map[string]string{"username": username}, 403)
	f.request(f.admin, "PATCH", path, map[string]string{"username": username}, 200)
	previous := mobileLoginForTest(t, f, strings.ToUpper(username), "QaPassword12345!")
	if me := mobileRequest(t, f, previous, "GET", "/api/auth/me", nil, 200); me["id"] != pid {
		t.Fatalf("unexpected mobile user: %v", me["id"])
	}
	mobileRequest(t, f, "", "POST", "/api/mobile/auth/login", map[string]string{"identifier": "admin@faracode.local", "password": "Demo@12345!"}, 403)
	f.request(f.admin, "PATCH", path, map[string]string{"username": "bad name!"}, 400)
	f.request(f.admin, "PATCH", path, map[string]string{"username": "field.reassigned", "password": "NewTestPassword123!"}, 200)
	f.request(web, "GET", "/api/auth/me", nil, 401)
	mobileRequest(t, f, previous, "GET", "/api/auth/me", nil, 401)
	mobileRequest(t, f, "", "POST", "/api/mobile/auth/login", map[string]string{"identifier": account["email"].(string), "password": "QaPassword12345!"}, 401)
	next := mobileLoginForTest(t, f, "field.reassigned", "NewTestPassword123!")
	mobileRequest(t, f, next, "POST", "/api/auth/logout", map[string]string{}, 200)
	mobileRequest(t, f, next, "GET", "/api/auth/me", nil, 401)
	var rawHash string
	if err := f.pool.QueryRow(context.Background(), "SELECT password_hash FROM people WHERE id=$1", pid).Scan(&rawHash); err != nil || strings.Contains(rawHash, "NewTestPassword") {
		t.Fatalf("password storage verification failed: %v", err)
	}
}

func TestMobileTrackingLimitsScopeAndReplaysOfflineSamples(t *testing.T) {
	f := newPlatformFixture(t)
	pid, web := f.person()
	me := f.request(web, "GET", "/api/auth/me", nil, 200)
	member := mobileLoginForTest(t, f, me["email"].(string), "QaPassword12345!")
	supervisor := mobileLoginForTest(t, f, "supervisor@faracode.local", "Demo@12345!")
	foreign := newPlatformClient()
	f.request(foreign, "POST", "/api/auth/demo", map[string]string{"role": "manager"}, 200)
	sid := f.activeShift(2)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": pid}, 201)
	startPath := "/api/shifts/" + sid + "/tracking"
	consent := map[string]bool{"consent": true}
	fix := map[string]any{"latitude": 35.7902, "longitude": 51.4105, "accuracy": 15}
	mobileRequest(t, f, member, "POST", startPath, consent, 403)
	mobileRequest(t, f, member, "POST", "/api/shifts/"+sid+"/check-in", fix, 201)
	mobileRequest(t, f, member, "POST", startPath, map[string]bool{"consent": false}, 400)
	tracking := mobileRequest(t, f, member, "POST", startPath, consent, 200)
	tid := tracking["id"].(string)
	if repeated := mobileRequest(t, f, member, "POST", startPath, consent, 200); repeated["id"] != tid {
		t.Fatal("starting twice created a duplicate tracking session")
	}
	// Simulate fixes recorded earlier in the same session without sleeping between samples.
	now := time.Now().UTC()
	if _, err := f.pool.Exec(context.Background(), "UPDATE tracking_sessions SET started_at=$2 WHERE id=$1", tid, now.Add(-3*time.Minute)); err != nil {
		t.Fatal(err)
	}
	samplePath := "/api/tracking/" + tid + "/samples"
	stored := now.Add(-2 * time.Minute)
	samples := []trackingSample{
		{geoBody{35.7902, 51.4105, 15}, stored},
		{geoBody{35.7903, 51.4106, 22}, stored.Add(31 * time.Second)},
		{geoBody{35.7903, 51.4106, 0}, stored.Add(time.Minute)},
		{geoBody{35.7903, 51.4106, 12}, now.Add(time.Hour)},
	}
	body := map[string]any{"samples": samples}
	mobileRequest(t, f, supervisor, "POST", samplePath, body, 403)
	result := mobileRequest(t, f, member, "POST", samplePath, body, 200)["results"].([]any)
	for i, want := range []string{"stored", "stored", "invalid_fix", "outside_window"} {
		if result[i] != want {
			t.Fatalf("sample %d: got %v, want %s", i, result[i], want)
		}
	}
	result = mobileRequest(t, f, member, "POST", samplePath, body, 200)["results"].([]any)
	if result[0] != "duplicate" || result[1] != "duplicate" {
		t.Fatal("replay did not deduplicate locations")
	}
	mobileRequest(t, f, member, "GET", "/api/tracking/live", nil, 403)
	f.request(foreign, "GET", "/api/tracking/live", nil, 403)
	mobileRequest(t, f, supervisor, "GET", "/api/tracking/live?shift_id=shift-5", nil, 403)
	supervisorView := mobileRequest(t, f, supervisor, "GET", "/api/tracking/live?shift_id="+sid, nil, 200)["points"].([]any)
	if len(supervisorView) != 1 || supervisorView[0].(map[string]any)["person_id"] != pid {
		t.Fatal("supervisor did not receive assigned member")
	}
	point := supervisorView[0].(map[string]any)
	if point["latitude"] != 35.7903 || point["accuracy"] != float64(22) {
		t.Fatalf("wrong latest fix: %v", point)
	}
	if len(f.request(f.admin, "GET", "/api/tracking/live", nil, 200)["points"].([]any)) != 1 {
		t.Fatal("admin cannot see active track")
	}
	// A supervisor can check in and share separately from their assigned sampler.
	mobileRequest(t, f, supervisor, "POST", "/api/shifts/"+sid+"/check-in", fix, 201)
	supervisorTrack := mobileRequest(t, f, supervisor, "POST", startPath, consent, 200)["id"].(string)
	if supervisorTrack == tid {
		t.Fatal("staff tracks must be distinct")
	}
	mobileRequest(t, f, supervisor, "POST", "/api/shifts/"+sid+"/check-out", fix, 200)
	stop := map[string]any{"stopped_at": stored.Add(40 * time.Second)}
	mobileRequest(t, f, member, "POST", "/api/tracking/"+tid+"/stop", stop, 200)
	mobileRequest(t, f, member, "POST", "/api/tracking/"+tid+"/stop", stop, 200)
	if len(f.request(f.admin, "GET", "/api/tracking/live", nil, 200)["points"].([]any)) != 0 {
		t.Fatal("stopped track remained visible")
	}
	result = mobileRequest(t, f, member, "POST", samplePath, map[string]any{"samples": []trackingSample{{geoBody{35.7901, 51.4104, 25}, stored.Add(-31 * time.Second)}, {geoBody{35.7901, 51.4104, 25}, stored.Add(50 * time.Second)}}}, 200)["results"].([]any)
	if result[0] != "stored" || result[1] != "outside_window" {
		t.Fatalf("unexpected offline replay results: %v", result)
	}
	mobileRequest(t, f, member, "POST", "/api/shifts/"+sid+"/check-out", fix, 200)
	var count int
	if err := f.pool.QueryRow(context.Background(), "SELECT count(*) FROM tracking_samples WHERE tracking_id=$1", tid).Scan(&count); err != nil || count != 3 {
		t.Fatalf("tracking samples persisted incorrectly: %d %v", count, err)
	}
}

func TestMobilePhotoRetryPersistsOneEvidence(t *testing.T) {
	f := newPlatformFixture(t)
	pid, web := f.person()
	me := f.request(web, "GET", "/api/auth/me", nil, 200)
	member := mobileLoginForTest(t, f, me["email"].(string), "QaPassword12345!")
	sid := f.activeShift(1)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": pid}, 201)
	contents := platformPhoto()
	upload := func(want int) string {
		t.Helper()
		var buf bytes.Buffer
		m := multipart.NewWriter(&buf)
		file, _ := m.CreateFormFile("file", "offline.png")
		file.Write(contents)
		m.WriteField("client_id", "offline-case-one")
		m.WriteField("caption", "stored offline")
		m.Close()
		req, _ := http.NewRequest("POST", f.server.URL+"/api/shifts/"+sid+"/evidence", &buf)
		req.Header.Set("Content-Type", m.FormDataContentType())
		req.Header.Set("X-Requested-With", "FaraCode")
		req.Header.Set("Authorization", "Bearer "+member)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		data, _ := io.ReadAll(res.Body)
		if res.StatusCode != want {
			t.Fatalf("upload got %d, want %d: %s", res.StatusCode, want, data)
		}
		var result map[string]string
		json.Unmarshal(data, &result)
		return result["id"]
	}
	evidence := upload(201)
	if _, err := f.pool.Exec(context.Background(), "UPDATE shifts SET status='completed' WHERE id=$1", sid); err != nil {
		t.Fatal(err)
	}
	if retry := upload(200); retry != evidence {
		t.Fatal("offline retry created a new evidence record")
	}
	var count int
	if err := f.pool.QueryRow(context.Background(), "SELECT count(*) FROM evidence WHERE shift_id=$1", sid).Scan(&count); err != nil || count != 1 {
		t.Fatalf("evidence persisted incorrectly: %d %v", count, err)
	}
	req, _ := http.NewRequest("GET", f.server.URL+"/api/evidence/"+evidence, nil)
	req.Header.Set("Authorization", "Bearer "+member)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	got, _ := io.ReadAll(res.Body)
	if res.StatusCode != 200 || !bytes.Equal(contents, got) {
		t.Fatal("stored evidence bytes missing")
	}
}

func TestLocationRetentionPrunesExpiredSessions(t *testing.T) {
	if os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skip("requires PostgreSQL")
	}
	f := newPlatformFixture(t)
	ctx := context.Background()
	_, err := f.pool.Exec(ctx, `INSERT INTO tracking_sessions(id,attendance_id,started_at,expires_at,stopped_at) SELECT 'track-old',id,now()-interval '9 days',now()-interval '8 days',now()-interval '8 days' FROM attendance LIMIT 1;
		INSERT INTO tracking_samples(tracking_id,bucket,captured_at,latitude,longitude,accuracy) VALUES('track-old',1,now()-interval '8 days',35,51,15)`)
	if err != nil {
		t.Fatal(err)
	}
	if err = New(f.pool, Config{}).PruneTracking(ctx); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM tracking_sessions WHERE id='track-old'").Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired tracking not removed: %d %v", count, err)
	}
}

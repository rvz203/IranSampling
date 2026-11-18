package app

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
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

func TestGeofenceAndValidation(t *testing.T) {
	if distanceMeters(35.79, 51.41, 35.79, 51.41) != 0 {
		t.Fatal("same point must have zero distance")
	}
	distance := distanceMeters(35.79, 51.41, 35.80, 51.41)
	if distance < 1100 || distance > 1120 {
		t.Fatalf("unexpected distance: %f", distance)
	}
	if validCoordinates(91, 0) || validCoordinates(0, 181) {
		t.Fatal("out-of-range coordinates accepted")
	}
	if validGeo(geoBody{35.79, 51.41, 151}) == nil || validGeo(geoBody{35.79, 51.41, 0}) == nil {
		t.Fatal("poor GPS accuracy accepted")
	}
	for _, formula := range []string{"=SUM(A1:A2)", "+123", "@cmd", "-2", "\tbad"} {
		if !strings.HasPrefix(safeCell(formula), "'") {
			t.Fatal("unsafe CSV cell")
		}
	}
	if safeCell("عادی") != "عادی" {
		t.Fatal("normal text changed")
	}
}

func TestOperationalWorkflow(t *testing.T) {
	rawURL := os.Getenv("TEST_DATABASE_URL")
	if rawURL == "" {
		t.Skip("TEST_DATABASE_URL is required for the PostgreSQL integration test")
	}
	parsed, err := url.Parse(rawURL)
	if err != nil || !strings.HasSuffix(parsed.Path, "_test") {
		t.Fatal("integration database name must end in _test")
	}
	ctx := context.Background()
	adminPool, err := database.Open(ctx, rawURL)
	if err != nil {
		t.Fatal(err)
	}
	defer adminPool.Close()
	schema := strings.ReplaceAll(id("test"), "-", "_")
	if _, err = adminPool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer adminPool.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	cfg, err := pgxpool.ParseConfig(rawURL)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		t.Fatal(err)
	}
	if err = database.Seed(ctx, pool); err != nil {
		t.Fatal(err)
	}
	server := New(pool, Config{Demo: true, UploadDir: t.TempDir()})
	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()
	jar, _ := cookiejar.New(nil)
	adminClient := &http.Client{Jar: jar, Timeout: 10 * time.Second}
	samplerJar, _ := cookiejar.New(nil)
	samplerClient := &http.Client{Jar: samplerJar, Timeout: 10 * time.Second}
	request := func(client *http.Client, method, path string, body any, want int) map[string]any {
		t.Helper()
		var data []byte
		if body != nil {
			data, _ = json.Marshal(body)
		}
		req, _ := http.NewRequest(method, httpServer.URL+path, bytes.NewReader(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Requested-With", "FaraCode")
		response, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		payload, _ := io.ReadAll(response.Body)
		if response.StatusCode != want {
			t.Fatalf("%s %s: want %d got %d: %s", method, path, want, response.StatusCode, payload)
		}
		var result map[string]any
		json.Unmarshal(payload, &result)
		return result
	}
	request(adminClient, "GET", "/api/workspace", nil, 401)
	req, _ := http.NewRequest("POST", httpServer.URL+"/api/auth/demo", strings.NewReader(`{"role":"admin"}`))
	req.Header.Set("Content-Type", "application/json")
	res, _ := adminClient.Do(req)
	if res.StatusCode != 403 {
		t.Fatal("write request missing CSRF header accepted")
	}
	res.Body.Close()
	request(adminClient, "POST", "/api/auth/demo", map[string]string{"role": "admin"}, 200)
	workspace := request(adminClient, "GET", "/api/workspace", nil, 200)
	if len(workspace["campaigns"].([]any)) != 6 {
		t.Fatal("seeded campaigns missing")
	}
	person := request(adminClient, "POST", "/api/people", map[string]string{"Name": "Test Sampler", "Email": "workflow@example.test", "Password": "TestPassword123!", "Role": "sampler", "City": "تهران"}, 201)["id"].(string)
	request(samplerClient, "POST", "/api/auth/login", map[string]string{"email": "workflow@example.test", "password": "wrong"}, 401)
	request(samplerClient, "POST", "/api/auth/login", map[string]string{"email": "workflow@example.test", "password": "TestPassword123!"}, 200)
	request(samplerClient, "POST", "/api/campaigns", map[string]string{}, 403)
	request(samplerClient, "POST", "/api/shifts/shift-5/stock", map[string]any{"kind": "distributed", "quantity": 1}, 403)
	date := time.Now()
	campaignBody := map[string]any{"name": "Workflow campaign", "brand_id": "brand-kalleh", "product_id": "product-yogurt", "target": 100, "status": "active", "start_date": date.AddDate(0, 0, -1).Format("2006-01-02"), "end_date": date.AddDate(0, 0, 1).Format("2006-01-02")}
	campaignBody["product_id"] = "product-coffee"
	request(adminClient, "POST", "/api/campaigns", campaignBody, 400)
	campaignBody["product_id"] = "product-yogurt"
	campaign := request(adminClient, "POST", "/api/campaigns", campaignBody, 201)["id"].(string)
	sid := request(adminClient, "POST", "/api/shifts", map[string]any{"campaign_id": campaign, "location_id": "loc-palladium", "supervisor_id": "p-supervisor", "starts_at": date.Add(-time.Hour).Format(time.RFC3339), "ends_at": date.Add(time.Hour).Format(time.RFC3339), "target": 100, "required_staff": 1}, 201)["id"].(string)
	request(adminClient, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": person}, 201)
	request(adminClient, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "initial", "quantity": 100}, 201)
	request(samplerClient, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "distributed", "quantity": 1}, 400)
	request(adminClient, "POST", "/api/shifts/"+sid+"/readiness", map[string]any{}, 200)
	geo := map[string]any{"latitude": 35.7902, "longitude": 51.4105, "accuracy": 151}
	request(samplerClient, "POST", "/api/shifts/"+sid+"/check-in", geo, 400)
	geo["accuracy"] = 15
	geo["latitude"] = 34.0
	request(samplerClient, "POST", "/api/shifts/"+sid+"/check-in", geo, 400)
	geo["latitude"] = 35.7902
	request(samplerClient, "POST", "/api/shifts/"+sid+"/check-in", geo, 201)
	request(samplerClient, "POST", "/api/shifts/"+sid+"/check-in", geo, 400)
	request(samplerClient, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "distributed", "quantity": 101}, 400)
	request(samplerClient, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "distributed", "quantity": 40}, 201)
	var wg sync.WaitGroup
	statuses := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			body := strings.NewReader(`{"kind":"distributed","quantity":50}`)
			req, _ := http.NewRequest("POST", httpServer.URL+"/api/shifts/"+sid+"/stock", body)
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Requested-With", "FaraCode")
			res, err := samplerClient.Do(req)
			if err != nil {
				statuses <- 0
				return
			}
			statuses <- res.StatusCode
			res.Body.Close()
		}()
	}
	wg.Wait()
	close(statuses)
	success, rejected := 0, 0
	for status := range statuses {
		if status == 201 {
			success++
		}
		if status == 400 {
			rejected++
		}
	}
	if success != 1 || rejected != 1 {
		t.Fatalf("concurrent stock overdraft: %d accepted, %d rejected", success, rejected)
	}
	request(adminClient, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "returned", "quantity": 10}, 201)
	upload := func(contents []byte, filename string, want int) {
		t.Helper()
		var body bytes.Buffer
		writer := multipart.NewWriter(&body)
		part, _ := writer.CreateFormFile("file", filename)
		part.Write(contents)
		writer.WriteField("caption", "Workflow evidence")
		writer.Close()
		req, _ := http.NewRequest("POST", httpServer.URL+"/api/shifts/"+sid+"/evidence", &body)
		req.Header.Set("Content-Type", writer.FormDataContentType())
		req.Header.Set("X-Requested-With", "FaraCode")
		res, err := samplerClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		if res.StatusCode != want {
			b, _ := io.ReadAll(res.Body)
			t.Fatalf("upload %d: %s", res.StatusCode, b)
		}
	}
	upload([]byte("<svg onload='alert(1)'/>"), "bad.png", 400)
	img := image.NewRGBA(image.Rect(0, 0, 20, 20))
	img.Set(1, 1, color.RGBA{10, 125, 110, 255})
	var imageData bytes.Buffer
	png.Encode(&imageData, img)
	upload(imageData.Bytes(), "field.png", 201)
	request(samplerClient, "POST", "/api/shifts/"+sid+"/report", map[string]string{"summary": "All samples accounted for and a successful shift."}, 400)
	request(samplerClient, "POST", "/api/shifts/"+sid+"/check-out", geo, 200)
	report := request(samplerClient, "POST", "/api/shifts/"+sid+"/report", map[string]string{"summary": "All samples accounted for and a successful shift."}, 201)["id"].(string)
	request(adminClient, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "added", "quantity": 5}, 400)
	request(samplerClient, "POST", "/api/reports/"+report+"/review", map[string]string{"status": "approved"}, 403)
	request(adminClient, "POST", "/api/reports/"+report+"/review", map[string]string{"status": "returned", "feedback": "Please clarify the feedback received."}, 200)
	request(samplerClient, "POST", "/api/shifts/"+sid+"/report", map[string]string{"summary": "Clarified customer feedback. Inventory and evidence complete."}, 201)
	request(adminClient, "POST", "/api/reports/"+report+"/review", map[string]string{"status": "approved"}, 200)
	request(adminClient, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "added", "quantity": 5}, 400)
	request(adminClient, "POST", "/api/reports/"+report+"/review", map[string]string{"status": "approved"}, 400)
	var balance, events int
	pool.QueryRow(ctx, "SELECT sum(CASE WHEN kind IN('initial','added') THEN quantity ELSE -quantity END)::integer FROM stock_movements WHERE shift_id=$1", sid).Scan(&balance)
	pool.QueryRow(ctx, "SELECT count(*) FROM audit_events WHERE entity_id=$1", sid).Scan(&events)
	if balance != 0 || events < 8 {
		t.Fatalf("unexpected persisted data: balance %d, events %d", balance, events)
	}
	final := request(samplerClient, "GET", "/api/workspace", nil, 200)
	for _, raw := range final["shifts"].([]any) {
		sh := raw.(map[string]any)
		if sh["id"] == "shift-5" {
			t.Fatal("out-of-scope shift leaked")
		}
	}
	response, err := adminClient.Get(httpServer.URL + "/api/reports/export?days=30")
	if err != nil {
		t.Fatal(err)
	}
	csvBytes, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != 200 || !bytes.Contains(csvBytes, []byte("Workflow campaign")) {
		t.Fatal("CSV export missing persisted campaign")
	}
	request(adminClient, "POST", "/api/auth/logout", map[string]any{}, 200)
	request(adminClient, "GET", "/api/workspace", nil, 401)
	production := New(pool, Config{Production: true, UploadDir: t.TempDir()})
	recorder := httptest.NewRecorder()
	req = httptest.NewRequest("POST", "/api/auth/demo", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Requested-With", "FaraCode")
	production.Handler().ServeHTTP(recorder, req)
	if recorder.Code != 404 {
		t.Fatal("production demo is reachable")
	}
	t.Log(fmt.Sprintf("Verified campaign %s: attendance, concurrent inventory, evidence, return/resubmit, approval, scoped records, CSV, audit and logout", campaign))
}

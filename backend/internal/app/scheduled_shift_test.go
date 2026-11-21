package app

import (
	"context"
	"net/url"
	"sync"
	"testing"
	"time"
)

func TestScheduledBreakAppliesToBothRolesAndScopesHistory(t *testing.T) {
	f := newPlatformFixture(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	start, end := now.Add(-time.Hour), now.Add(time.Hour)
	campaign := f.campaign(now.AddDate(0, 0, -1).Format(time.DateOnly), now.AddDate(0, 0, 2).Format(time.DateOnly))
	shift := f.shift(campaign, start, end, 2)
	person, web := f.person()
	schedule := map[string]any{
		"starts_at": start, "ends_at": end, "break_starts_at": now.Add(5 * time.Minute),
		"break_ends_at": now.Add(30 * time.Minute), "person_ids": []string{person}, "supervisor_id": "p-supervisor",
	}
	schedulePath := "/api/shifts/" + shift + "/schedule"
	f.request(web, "PATCH", schedulePath, schedule, 403)
	f.request(f.admin, "PATCH", schedulePath, schedule, 200)
	otherShift := f.shift(campaign, start, end, 2)
	f.request(f.admin, "PATCH", "/api/shifts/"+otherShift+"/schedule", schedule, 400)

	geo := geoBody{35.7902, 51.4105, 15}
	identifier := f.request(web, "GET", "/api/auth/me", nil, 200)["email"].(string)
	sampler := mobileLoginForTest(t, f, identifier, "QaPassword12345!")
	supervisor := mobileLoginForTest(t, f, "supervisor@faracode.local", "Demo@12345!")
	tokens := []string{sampler, supervisor}
	tracks := make([]string, len(tokens))
	for i, token := range tokens {
		mobileRequest(t, f, token, "POST", "/api/shifts/"+shift+"/check-in", geo, 201)
		session := mobileRequest(t, f, token, "POST", "/api/shifts/"+shift+"/tracking", map[string]bool{"consent": true}, 200)
		if session["break_starts_at"] == nil || session["work_starts_at"] == nil {
			t.Fatal("phone did not receive the scheduled work and lunch times")
		}
		tracks[i] = session["id"].(string)
	}
	f.request(f.admin, "PATCH", schedulePath, map[string]any{
		"starts_at": start, "ends_at": end, "break_starts_at": now.Add(6 * time.Minute),
		"break_ends_at": now.Add(24 * time.Minute), "person_ids": []string{person}, "supervisor_id": "p-supervisor",
	}, 200)
	refreshed := mobileRequest(t, f, sampler, "GET", "/api/tracking/"+tracks[0]+"/schedule", nil, 200)
	if refreshed["break_starts_at"] == nil || refreshed["shift_id"] != shift {
		t.Fatalf("schedule refresh missing: %v", refreshed)
	}
	mobileRequest(t, f, supervisor, "GET", "/api/tracking/"+tracks[0]+"/schedule", nil, 403)

	// Move test-only timestamps so the same phones can replay samples around
	// both boundaries using real server validation, without a wall-clock wait.
	breakStart, breakEnd := now.Add(-6*time.Minute), now.Add(10*time.Minute)
	if _, err := f.pool.Exec(ctx, "UPDATE shifts SET break_starts_at=$2,break_ends_at=$3 WHERE id=$1", shift, breakStart, breakEnd); err != nil {
		t.Fatal(err)
	}
	for i, track := range tracks {
		if _, err := f.pool.Exec(ctx, "UPDATE tracking_sessions SET started_at=$2 WHERE id=$1", track, breakStart.Add(-3*time.Minute)); err != nil {
			t.Fatal(err)
		}
		body := map[string]any{"samples": []trackingSample{
			{geo, breakStart.Add(-60 * time.Second)}, {geo, breakStart.Add(-30 * time.Second)},
			{geo, breakStart}, {geo, breakStart.Add(30 * time.Second)},
		}}
		results := mobileRequest(t, f, tokens[i], "POST", "/api/tracking/"+track+"/samples", body, 200)["results"].([]any)
		for pos, want := range []string{"stored", "stored", "break", "break"} {
			if results[pos] != want {
				t.Fatalf("role %d: sample %d returned %v, want %q", i, pos, results[pos], want)
			}
		}
	}
	assertLive := func(state string, hasFix bool) {
		t.Helper()
		points := f.request(f.admin, "GET", "/api/tracking/live?shift_id="+shift+"&campaign_id="+campaign, nil, 200)["points"].([]any)
		if len(points) != 2 {
			t.Fatalf("expected two people in the shift: %v", points)
		}
		for _, raw := range points {
			point := raw.(map[string]any)
			if point["state"] != state || (point["latitude"] != nil) != hasFix {
				t.Fatalf("wrong live state: %v", point)
			}
		}
	}
	assertLive("break", false)
	breakEnd = now.Add(-2 * time.Minute)
	if _, err := f.pool.Exec(ctx, "UPDATE shifts SET break_ends_at=$2 WHERE id=$1", shift, breakEnd); err != nil {
		t.Fatal(err)
	}
	assertLive("working", false)
	for i, track := range tracks {
		body := map[string]any{"samples": []trackingSample{{geo, breakEnd}, {geo, breakEnd.Add(30 * time.Second)}}}
		results := mobileRequest(t, f, tokens[i], "POST", "/api/tracking/"+track+"/samples", body, 200)["results"].([]any)
		if results[0] != "stored" || results[1] != "stored" {
			t.Fatalf("sampling did not resume after the break: %v", results)
		}
	}
	assertLive("working", true)
	for _, pid := range []string{person, "p-supervisor"} {
		path := "/api/shifts/" + shift + "/tracking-history?person_id=" + url.QueryEscape(pid)
		mobileRequest(t, f, supervisor, "GET", path, nil, 403)
		mobileRequest(t, f, sampler, "GET", path, nil, 403)
		samples := f.request(f.admin, "GET", path, nil, 200)["samples"].([]any)
		if len(samples) != 4 || samples[0].(map[string]any)["segment"] == samples[2].(map[string]any)["segment"] {
			t.Fatalf("history did not separate the route across lunch: %v", samples)
		}
	}
	f.request(f.admin, "GET", "/api/shifts/"+otherShift+"/tracking-history?person_id="+person, nil, 404)
	f.request(f.admin, "PATCH", schedulePath, schedule, 400)
}

func TestAutomaticShiftCloseCreatesOneReportAndClosesAttendance(t *testing.T) {
	f := newPlatformFixture(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Second)
	sid := f.activeShift(1)
	person, attendee := f.person()
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/assignments", map[string]string{"person_id": person}, 201)
	geo := geoBody{35.7902, 51.4105, 15}
	f.request(attendee, "POST", "/api/shifts/"+sid+"/check-in", geo, 201)
	token := mobileLoginForTest(t, f, f.request(attendee, "GET", "/api/auth/me", nil, 200)["email"].(string), "QaPassword12345!")
	tracking := mobileRequest(t, f, token, "POST", "/api/shifts/"+sid+"/tracking", map[string]bool{"consent": true}, 200)["id"].(string)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/readiness", map[string]any{}, 200)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "initial", "quantity": 10}, 201)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/stock", map[string]any{"kind": "distributed", "quantity": 4}, 201)
	path := "/api/shifts/" + sid + "/summary"
	f.request(f.admin, "GET", path, nil, 404)
	ended := now.Add(-time.Minute)
	if _, err := f.pool.Exec(ctx, `UPDATE shifts SET starts_at=$2,ends_at=$3,break_starts_at=$4,break_ends_at=$5 WHERE id=$1`,
		sid, ended.Add(-80*time.Minute), ended, ended.Add(-50*time.Minute), ended.Add(-30*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE attendance SET checked_in_at=$2 WHERE shift_id=$1", sid, ended.Add(-70*time.Minute)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE tracking_sessions SET started_at=$2 WHERE id=$1", tracking, ended.Add(-70*time.Minute)); err != nil {
		t.Fatal(err)
	}
	generator := New(f.pool, Config{})
	var wg sync.WaitGroup
	for range 2 {
		wg.Go(func() {
			if err := generator.FinalizeDueShifts(ctx); err != nil {
				t.Error(err)
			}
		})
	}
	wg.Wait()
	summary := f.request(f.admin, "GET", path, nil, 200)
	metrics := summary["metrics"].(map[string]any)
	if metrics["distributed"] != float64(4) || metrics["remaining"] != float64(6) || metrics["photo_count"] != float64(0) {
		t.Fatalf("wrong closing metrics: %v", metrics)
	}
	team := metrics["team"].([]any)
	member := team[1].(map[string]any)
	if len(team) != 2 || member["id"] != person || member["work_minutes"] != float64(50) || member["ended_automatically"] != true {
		t.Fatalf("wrong closed attendance: %v", team)
	}
	redacted := f.request(attendee, "GET", path, nil, 200)["metrics"].(map[string]any)["team"].([]any)[0].(map[string]any)
	if _, exists := redacted["checked_in_at"]; exists {
		t.Fatal("sampler received another member's timestamps")
	}
	f.request(attendee, "POST", "/api/shifts/"+sid+"/end", map[string]any{}, 403)
	f.request(f.admin, "POST", "/api/shifts/"+sid+"/end", map[string]any{}, 200)
	retry := f.request(f.admin, "GET", path, nil, 200)
	if retry["generated_at"] != summary["generated_at"] {
		t.Fatal("closeout was overwritten on retry")
	}
	result := mobileRequest(t, f, token, "POST", "/api/tracking/"+tracking+"/samples", map[string]any{
		"samples": []trackingSample{{geo, ended.Add(-30 * time.Second)}, {geo, ended}},
	}, 200)["results"].([]any)
	if result[0] != "stored" || result[1] != "outside_window" {
		t.Fatalf("offline replay should retain only fixes from before close: %v", result)
	}
}

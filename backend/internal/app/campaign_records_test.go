package app

import (
	"context"
	"strconv"
	"testing"
	"time"

	"faracode/sampling/internal/database"
)

func TestCampaignConversationAndArchiveAreScoped(t *testing.T) {
	f := newPlatformFixture(t)
	ctx := context.Background()
	pid, member := f.person()
	email := f.request(member, "GET", "/api/auth/me", nil, 200)["email"].(string)
	token := mobileLoginForTest(t, f, email, "QaPassword12345!")
	now := time.Now()
	mainCampaign := f.campaign(now.AddDate(0, 0, -1).Format("2006-01-02"), now.AddDate(0, 0, 2).Format("2006-01-02"))
	otherCampaign := f.campaign(now.AddDate(0, 0, -1).Format("2006-01-02"), now.AddDate(0, 0, 2).Format("2006-01-02"))
	shift := f.shift(mainCampaign, now.Add(-time.Hour), now.Add(time.Hour), 2)
	f.request(f.admin, "POST", "/api/shifts/"+shift+"/assignments", map[string]string{"person_id": pid}, 201)

	main := "/api/campaigns/" + mainCampaign
	other := "/api/campaigns/" + otherCampaign
	body := map[string]string{"body": "پیام تیم اول", "client_id": "f4296e5e-60d8-4a39-87cb-4d25a60431ee"}
	f.request(newPlatformClient(), "GET", main+"/messages", nil, 401)
	mobileRequest(t, f, token, "GET", other+"/messages", nil, 403)
	mobileRequest(t, f, token, "GET", other+"/history", nil, 403)
	mobileRequest(t, f, token, "POST", other+"/messages", body, 403)
	f.request(f.admin, "POST", other+"/messages", body, 200)
	first := mobileRequest(t, f, token, "POST", main+"/messages", body, 200)
	again := mobileRequest(t, f, token, "POST", main+"/messages", body, 200)
	if first["id"] != again["id"] || first["sender_id"] != pid || first["body"] != body["body"] {
		t.Fatalf("message retry did not preserve the original record: %v %v", first, again)
	}
	f.request(f.admin, "POST", main+"/messages", map[string]string{"body": "  ", "client_id": body["client_id"]}, 400)
	if rows := f.request(f.admin, "GET", main+"/messages", nil, 200)["messages"].([]any); len(rows) != 1 {
		t.Fatalf("campaign included a duplicate or a foreign message: %v", rows)
	}

	// Simulate an audit row written before campaign association existed.
	if _, err := f.pool.Exec(ctx, `INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,detail,created_at)
		VALUES('legacy-shift-event','p-admin','shipment','shift',$1,'رویداد قدیمی',now()-interval '200 days')`, shift); err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, f.pool); err != nil {
		t.Fatal(err)
	}
	f.request(f.admin, "PATCH", main, map[string]string{"status": "completed"}, 200)
	events := mobileRequest(t, f, token, "GET", main+"/history", nil, 200)["events"].([]any)
	actions := map[string]bool{}
	for _, item := range events {
		event := item.(map[string]any)
		actions[event["action"].(string)] = true
	}
	for _, action := range []string{"campaign_create", "shift_create", "assignment", "shipment", "campaign_update"} {
		if !actions[action] {
			t.Errorf("completed campaign's history omitted %q", action)
		}
	}
	if rows := f.request(f.admin, "GET", other+"/history", nil, 200)["events"].([]any); len(rows) != 1 {
		t.Fatalf("unrelated history received events from the first campaign: %v", rows)
	}
	if rows := mobileRequest(t, f, token, "GET", main+"/messages", nil, 200)["messages"].([]any); len(rows) != 1 {
		t.Fatal("completing the campaign removed its conversation")
	}
}

func TestCampaignMessagePagination(t *testing.T) {
	f := newPlatformFixture(t)
	if _, err := f.pool.Exec(context.Background(), `INSERT INTO campaign_messages(campaign_id,sender_id,sender_name,sender_role,client_id,body)
		SELECT 'cmp-1','p-admin','Test admin','admin',gen_random_uuid(),n::text FROM generate_series(1,53) n`); err != nil {
		t.Fatal(err)
	}
	path := "/api/campaigns/cmp-1/messages"
	page := f.request(f.admin, "GET", path, nil, 200)
	if len(page["messages"].([]any)) != 50 || page["next_before"] == nil {
		t.Fatalf("incorrect first page: %v", page["next_before"])
	}
	cursor := strconv.FormatInt(int64(page["next_before"].(float64)), 10)
	older := f.request(f.admin, "GET", path+"?before="+cursor, nil, 200)
	if len(older["messages"].([]any)) != 3 || older["next_before"] != nil {
		t.Fatalf("incorrect older page: %v", older)
	}
	f.request(f.admin, "GET", path+"?before=-20", nil, 400)
}

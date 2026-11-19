package app

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

const campaignPageSize = 50

var messageClientID = regexp.MustCompile(`(?i)^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$`)

type campaignMessage struct {
	ID         int64     `json:"id"`
	SenderID   string    `json:"sender_id"`
	SenderName string    `json:"sender_name"`
	SenderRole string    `json:"sender_role"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

type campaignEvent struct {
	ID        string    `json:"id"`
	Action    string    `json:"action"`
	Detail    string    `json:"detail"`
	ActorName string    `json:"actor_name"`
	ShiftID   string    `json:"shift_id"`
	Location  string    `json:"location_name"`
	CreatedAt time.Time `json:"created_at"`
}

func (s *Server) campaignAccess(ctx context.Context, p Person, campaign string) error {
	var allowed bool
	if err := s.db.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM campaigns c WHERE c.id=$3 AND `+visibleCampaign+`)`,
		isPlanner(p), p.ID, campaign).Scan(&allowed); err != nil {
		return err
	}
	if !allowed {
		return forbidden()
	}
	return nil
}

func (s *Server) campaignMessages(w http.ResponseWriter, r *http.Request) error {
	p, campaign := current(r), r.PathValue("id")
	ctx := r.Context()
	if err := s.campaignAccess(ctx, p, campaign); err != nil {
		return err
	}
	var before int64
	if cursor := r.URL.Query().Get("before"); cursor != "" {
		value, err := strconv.ParseInt(cursor, 10, 64)
		if err != nil || value <= 0 {
			return bad("نشانگر پیام معتبر نیست / Invalid message cursor")
		}
		before = value
	}
	rows, err := s.db.Query(ctx, `SELECT id,sender_id,sender_name,sender_role,body,created_at
		FROM campaign_messages WHERE campaign_id=$1 AND ($2::bigint=0 OR id<$2) ORDER BY id DESC LIMIT $3`,
		campaign, before, campaignPageSize+1)
	if err != nil {
		return err
	}
	messages, err := pgx.CollectRows(rows, pgx.RowToStructByPos[campaignMessage])
	if err != nil {
		return err
	}
	var next *int64
	if len(messages) > campaignPageSize {
		messages = messages[:campaignPageSize]
		next = &messages[campaignPageSize-1].ID
	}
	writeJSON(w, 200, map[string]any{"messages": messages, "next_before": next})
	return nil
}

func (s *Server) postCampaignMessage(w http.ResponseWriter, r *http.Request) error {
	var b struct {
		Body     string `json:"body"`
		ClientID string `json:"client_id"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	b.Body = strings.TrimSpace(b.Body)
	if b.Body == "" || utf8.RuneCountInString(b.Body) > 2000 || strings.ContainsRune(b.Body, 0) {
		return bad("پیام باید بین ۱ تا ۲۰۰۰ نویسه باشد / Enter a message of 1–2000 characters")
	}
	if !messageClientID.MatchString(b.ClientID) {
		return bad("شناسهٔ پیام معتبر نیست / Invalid message id")
	}
	p := current(r)
	var saved campaignMessage
	err := s.db.QueryRow(r.Context(), `INSERT INTO campaign_messages(campaign_id,sender_id,sender_name,sender_role,client_id,body)
		SELECT c.id,$2,$4,$5,$6::uuid,$7 FROM campaigns c WHERE c.id=$3 AND `+visibleCampaign+`
		ON CONFLICT(campaign_id,sender_id,client_id) DO UPDATE SET client_id=EXCLUDED.client_id
		RETURNING id,sender_id,sender_name,sender_role,body,created_at`,
		isPlanner(p), p.ID, r.PathValue("id"), p.Name, p.Role, b.ClientID, b.Body).
		Scan(&saved.ID, &saved.SenderID, &saved.SenderName, &saved.SenderRole, &saved.Body, &saved.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return forbidden()
	}
	if err != nil {
		return err
	}
	writeJSON(w, 200, saved)
	return nil
}

func (s *Server) campaignHistory(w http.ResponseWriter, r *http.Request) error {
	p, campaign := current(r), r.PathValue("id")
	ctx := r.Context()
	if err := s.campaignAccess(ctx, p, campaign); err != nil {
		return err
	}
	rows, err := s.db.Query(ctx, `SELECT e.id,e.action,e.detail,p.name,COALESCE(s.id,''),COALESCE(l.name,''),e.created_at
		FROM audit_events e JOIN people p ON p.id=e.actor_id
		LEFT JOIN shift_reports sr ON e.entity_type='report' AND sr.id=e.entity_id
		LEFT JOIN shifts s ON s.id=CASE e.entity_type WHEN 'shift' THEN e.entity_id WHEN 'report' THEN sr.shift_id END
		LEFT JOIN locations l ON l.id=s.location_id
		WHERE e.campaign_id=$3 AND ($1 OR e.entity_type='campaign' OR (s.id IS NOT NULL AND `+visibleShift+`))
		AND ($4='' OR (e.created_at,e.id)<(SELECT cursor.created_at,cursor.id FROM audit_events cursor WHERE cursor.id=$4 AND cursor.campaign_id=$3))
		ORDER BY e.created_at DESC,e.id DESC LIMIT $5`, isPlanner(p), p.ID, campaign, r.URL.Query().Get("before"), campaignPageSize+1)
	if err != nil {
		return err
	}
	events, err := pgx.CollectRows(rows, pgx.RowToStructByPos[campaignEvent])
	if err != nil {
		return err
	}
	var next *string
	if len(events) > campaignPageSize {
		events = events[:campaignPageSize]
		next = &events[campaignPageSize-1].ID
	}
	writeJSON(w, 200, map[string]any{"events": events, "next_before": next})
	return nil
}

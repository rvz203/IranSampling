package app

import (
	"context"
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

const trackingRetention = 7 * 24 * time.Hour
const trackingInterval = 30 * time.Second

type trackingSession struct {
	ID         string    `json:"id"`
	ShiftID    string    `json:"shift_id"`
	StartedAt  time.Time `json:"started_at"`
	ExpiresAt  time.Time `json:"expires_at"`
	ServerTime time.Time `json:"server_time"`
}

func (s *Server) startTracking(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if p.Role != "supervisor" && p.Role != "sampler" {
		return forbidden()
	}
	var b struct {
		Consent bool `json:"consent"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if !b.Consent {
		return bad("برای شروع، اشتراک موقعیت همین شیفت را تأیید کنید / Confirm location sharing for this shift")
	}
	ctx := r.Context()
	session := trackingSession{ShiftID: r.PathValue("id")}
	err := s.transaction(r, func(tx pgx.Tx) error {
		var attendanceID, status string
		var now time.Time
		err := tx.QueryRow(ctx, `SELECT a.id,s.status,s.ends_at,clock_timestamp() FROM shifts s
			JOIN attendance a ON a.shift_id=s.id AND a.person_id=$2 AND a.checked_out_at IS NULL
			WHERE s.id=$1 AND (($3='supervisor' AND s.supervisor_id=$2) OR ($3='sampler' AND EXISTS(SELECT 1 FROM assignments x WHERE x.shift_id=s.id AND x.person_id=$2))) FOR UPDATE OF s`, session.ShiftID, p.ID, p.Role).Scan(&attendanceID, &status, &session.ExpiresAt, &now)
		if errors.Is(err, pgx.ErrNoRows) {
			return forbidden()
		}
		if err != nil {
			return err
		}
		if status != "active" || !now.Before(session.ExpiresAt) {
			return bad("اشتراک موقعیت فقط در شیفت فعال ممکن است / Location sharing requires an active shift")
		}
		session.ServerTime = now
		err = tx.QueryRow(ctx, `SELECT id,started_at,expires_at FROM tracking_sessions WHERE attendance_id=$1 AND stopped_at IS NULL`, attendanceID).Scan(&session.ID, &session.StartedAt, &session.ExpiresAt)
		if err == nil {
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		session.ID = id("tracking")
		session.StartedAt = now
		if _, err = tx.Exec(ctx, `INSERT INTO tracking_sessions(id,attendance_id,started_at,expires_at) VALUES($1,$2,$3,$4)`, session.ID, attendanceID, now, session.ExpiresAt); err != nil {
			return err
		}
		return audit(ctx, tx, p, "tracking_start", "shift", session.ShiftID, p.Name+" اشتراک موقعیت شیفت را فعال کرد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, session)
	return nil
}

type trackingSample struct {
	geoBody
	CapturedAt time.Time `json:"captured_at"`
}

func (s *Server) recordTrackingSamples(w http.ResponseWriter, r *http.Request) error {
	var b struct {
		Samples []trackingSample `json:"samples"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if len(b.Samples) == 0 || len(b.Samples) > 120 {
		return bad("در هر ارسال ۱ تا ۱۲۰ موقعیت بفرستید / Send 1–120 location samples per request")
	}
	ctx := r.Context()
	tid := r.PathValue("id")
	results := make([]string, len(b.Samples))
	err := s.transaction(r, func(tx pgx.Tx) error {
		var start, end time.Time
		err := tx.QueryRow(ctx, `SELECT t.started_at,LEAST(t.expires_at,COALESCE(t.stopped_at,t.expires_at),COALESCE(a.checked_out_at,t.expires_at))
			FROM tracking_sessions t JOIN attendance a ON a.id=t.attendance_id WHERE t.id=$1 AND a.person_id=$2 FOR SHARE OF t`, tid, current(r).ID).Scan(&start, &end)
		if errors.Is(err, pgx.ErrNoRows) {
			return forbidden()
		}
		if err != nil {
			return err
		}
		now := time.Now()
		for i, sample := range b.Samples {
			if sample.CapturedAt.Before(start) || sample.CapturedAt.After(end) || sample.CapturedAt.After(now.Add(30*time.Second)) || sample.CapturedAt.Before(now.Add(-trackingRetention)) {
				results[i] = "outside_window"
				continue
			}
			if !validCoordinates(sample.Latitude, sample.Longitude) || math.IsNaN(sample.Accuracy) || sample.Accuracy <= 0 || sample.Accuracy > 1000 {
				results[i] = "invalid_fix"
				continue
			}
			bucket := sample.CapturedAt.Unix() / int64(trackingInterval.Seconds())
			tag, err := tx.Exec(ctx, `INSERT INTO tracking_samples(tracking_id,bucket,captured_at,latitude,longitude,accuracy) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tracking_id,bucket) DO NOTHING`, tid, bucket, sample.CapturedAt, sample.Latitude, sample.Longitude, sample.Accuracy)
			if err != nil {
				return err
			}
			results[i] = "duplicate"
			if tag.RowsAffected() != 0 {
				results[i] = "stored"
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]any{"results": results})
	return nil
}

func (s *Server) stopTracking(w http.ResponseWriter, r *http.Request) error {
	var b struct {
		StoppedAt *time.Time `json:"stopped_at"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	ctx := r.Context()
	p := current(r)
	tid := r.PathValue("id")
	stopped := time.Now()
	if b.StoppedAt != nil && b.StoppedAt.Before(stopped) {
		stopped = *b.StoppedAt
	}
	err := s.transaction(r, func(tx pgx.Tx) error {
		var sid string
		var wasStopped bool
		err := tx.QueryRow(ctx, `SELECT a.shift_id,t.stopped_at IS NOT NULL FROM tracking_sessions t JOIN attendance a ON a.id=t.attendance_id WHERE t.id=$1 AND a.person_id=$2 FOR UPDATE OF t`, tid, p.ID).Scan(&sid, &wasStopped)
		if errors.Is(err, pgx.ErrNoRows) {
			return forbidden()
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE tracking_sessions SET stopped_at=GREATEST(started_at,LEAST(expires_at,COALESCE(stopped_at,expires_at),$2)) WHERE id=$1`, tid, stopped); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM tracking_samples WHERE tracking_id=$1 AND captured_at>(SELECT stopped_at FROM tracking_sessions WHERE id=$1)`, tid); err != nil {
			return err
		}
		if !wasStopped {
			return audit(ctx, tx, p, "tracking_stop", "shift", sid, p.Name+" اشتراک موقعیت شیفت را متوقف کرد")
		}
		return nil
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

type livePoint struct {
	PersonID     string     `json:"person_id"`
	PersonName   string     `json:"person_name"`
	Role         string     `json:"role"`
	ShiftID      string     `json:"shift_id"`
	LocationName string     `json:"location_name"`
	StartedAt    time.Time  `json:"started_at"`
	CapturedAt   *time.Time `json:"captured_at"`
	ReceivedAt   *time.Time `json:"received_at"`
	Latitude     *float64   `json:"latitude"`
	Longitude    *float64   `json:"longitude"`
	Accuracy     *float64   `json:"accuracy"`
}

func (s *Server) liveTracking(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if p.Role != "admin" && p.Role != "supervisor" {
		return forbidden()
	}
	sid := r.URL.Query().Get("shift_id")
	campaign := r.URL.Query().Get("campaign_id")
	if campaign != "" {
		if err := s.campaignAccess(r.Context(), p, campaign); err != nil {
			return err
		}
	}
	if sid != "" && p.Role == "supervisor" {
		if err := s.shiftAccess(r.Context(), p, sid, true); err != nil {
			return err
		}
	}
	rows, err := s.db.Query(r.Context(), `SELECT p.id,p.name,p.role,s.id,l.name,t.started_at,q.captured_at,q.received_at,q.latitude,q.longitude,q.accuracy
		FROM tracking_sessions t JOIN attendance a ON a.id=t.attendance_id JOIN people p ON p.id=a.person_id
		JOIN shifts s ON s.id=a.shift_id JOIN locations l ON l.id=s.location_id
		LEFT JOIN LATERAL (SELECT captured_at,received_at,latitude,longitude,accuracy FROM tracking_samples WHERE tracking_id=t.id ORDER BY bucket DESC LIMIT 1) q ON true
		WHERE t.stopped_at IS NULL AND t.expires_at>now() AND a.checked_out_at IS NULL AND s.status='active' AND p.active
		AND ($1 OR s.supervisor_id=$2) AND ($3='' OR s.id=$3) AND ($4='' OR s.campaign_id=$4)
		ORDER BY q.captured_at DESC NULLS LAST,p.name`, p.Role == "admin", p.ID, sid, campaign)
	if err != nil {
		return err
	}
	defer rows.Close()
	points := make([]livePoint, 0)
	for rows.Next() {
		var point livePoint
		if err := rows.Scan(&point.PersonID, &point.PersonName, &point.Role, &point.ShiftID, &point.LocationName, &point.StartedAt, &point.CapturedAt, &point.ReceivedAt, &point.Latitude, &point.Longitude, &point.Accuracy); err != nil {
			return err
		}
		points = append(points, point)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]any{"server_time": time.Now().UTC(), "interval_seconds": int(trackingInterval.Seconds()), "points": points})
	return nil
}

func (s *Server) PruneTracking(ctx context.Context) error {
	cutoff := time.Now().Add(-trackingRetention)
	if _, err := s.db.Exec(ctx, "DELETE FROM tracking_samples WHERE captured_at<$1", cutoff); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, "DELETE FROM tracking_sessions WHERE expires_at<$1", cutoff)
	return err
}

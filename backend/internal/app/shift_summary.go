package app

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

// The caller locks the shift. Closing attendance, stopping tracking and creating
// the report are one operation, including when another API instance retries it.
func closeShift(ctx context.Context, tx pgx.Tx, sid string, endedAt time.Time) error {
	tag, err := tx.Exec(ctx, "UPDATE shifts SET ended_at=$2 WHERE id=$1 AND ended_at IS NULL", sid, endedAt)
	if err != nil || tag.RowsAffected() == 0 {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE attendance SET checked_out_at=GREATEST(checked_in_at,$2),ended_automatically=true
		WHERE shift_id=$1 AND checked_out_at IS NULL`, sid, endedAt); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE tracking_sessions t SET stopped_at=GREATEST(t.started_at,LEAST(t.expires_at,$2))
		FROM attendance a WHERE t.attendance_id=a.id AND a.shift_id=$1 AND t.stopped_at IS NULL`, sid, endedAt); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM tracking_samples q USING tracking_sessions t,attendance a
		WHERE q.tracking_id=t.id AND t.attendance_id=a.id AND a.shift_id=$1 AND q.captured_at >= $2`, sid, endedAt); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		WITH roster AS (
			SELECT supervisor_id person_id FROM shifts WHERE id=$1
			UNION SELECT person_id FROM assignments WHERE shift_id=$1
			UNION SELECT person_id FROM attendance WHERE shift_id=$1
		)
		INSERT INTO shift_summaries(shift_id,metrics)
		SELECT s.id,jsonb_build_object(
			'target',s.target,'distributed',m.distributed,'received',m.received,'damaged',m.damaged,'returned',m.returned,
			'remaining',m.received-m.distributed-m.damaged-m.returned,
			'photo_count',(SELECT count(*) FROM evidence WHERE shift_id=s.id),
			'open_issues',(SELECT count(*) FROM issues WHERE shift_id=s.id AND status<>'resolved'),
			'team',(SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',p.role,
				'checked_in_at',a.checked_in_at,'checked_out_at',a.checked_out_at,
				'ended_automatically',COALESCE(a.ended_automatically,false),
				'work_minutes',CASE WHEN a.id IS NULL THEN 0 ELSE floor((
					GREATEST(0,extract(epoch FROM LEAST(a.checked_out_at,s.ended_at)-GREATEST(a.checked_in_at,s.starts_at))) -
					CASE WHEN s.break_starts_at IS NULL THEN 0 ELSE GREATEST(0,extract(epoch FROM
						LEAST(a.checked_out_at,s.ended_at,s.break_ends_at)-GREATEST(a.checked_in_at,s.break_starts_at))) END
					)/60) END) ORDER BY (p.id=s.supervisor_id) DESC,p.name,p.id)
				FROM roster JOIN people p ON p.id=roster.person_id LEFT JOIN attendance a ON a.person_id=p.id AND a.shift_id=s.id)
		)
		FROM shifts s CROSS JOIN LATERAL (
			SELECT COALESCE(sum(quantity) FILTER(WHERE kind IN ('initial','added')),0) received,
			       COALESCE(sum(quantity) FILTER(WHERE kind='distributed'),0) distributed,
			       COALESCE(sum(quantity) FILTER(WHERE kind='damaged'),0) damaged,
			       COALESCE(sum(quantity) FILTER(WHERE kind='returned'),0) returned
			FROM stock_movements WHERE shift_id=s.id
		) m WHERE s.id=$1`, sid)
	return err
}

func (s *Server) FinalizeDueShifts(ctx context.Context) error {
	for i := 0; i < 100; i++ {
		err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
			var sid string
			var endedAt time.Time
			if err := tx.QueryRow(ctx, `SELECT s.id,LEAST(s.ends_at,COALESCE(r.reviewed_at,clock_timestamp()))
				FROM shifts s LEFT JOIN shift_reports r ON r.shift_id=s.id AND r.status='approved'
				WHERE s.ended_at IS NULL AND (s.ends_at<=clock_timestamp() OR s.status='completed')
				ORDER BY s.ends_at,s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED`).Scan(&sid, &endedAt); err != nil {
				return err
			}
			return closeShift(ctx, tx, sid, endedAt)
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) endShift(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if p.Role != "admin" && p.Role != "supervisor" {
		return forbidden()
	}
	sid := r.PathValue("id")
	ctx := r.Context()
	if err := s.transaction(r, func(tx pgx.Tx) error {
		var leader string
		var start, end, now time.Time
		var closed *time.Time
		if err := tx.QueryRow(ctx, "SELECT supervisor_id,starts_at,ends_at,ended_at,clock_timestamp() FROM shifts WHERE id=$1 FOR UPDATE", sid).
			Scan(&leader, &start, &end, &closed, &now); err != nil {
			return err
		}
		if p.Role == "supervisor" && leader != p.ID {
			return forbidden()
		}
		if closed != nil {
			return nil
		}
		if now.Before(start) {
			return bad("شیفت هنوز شروع نشده است / This shift has not started")
		}
		if end.Before(now) {
			now = end
		}
		if err := closeShift(ctx, tx, sid, now); err != nil {
			return err
		}
		return audit(ctx, tx, p, "shift_end", "shift", sid, "شیفت پایان یافت و خلاصه خودکار ثبت شد")
	}); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

func (s *Server) shiftSummary(w http.ResponseWriter, r *http.Request) error {
	ctx, sid := r.Context(), r.PathValue("id")
	p := current(r)
	if err := s.shiftAccess(ctx, p, sid, false); err != nil {
		return err
	}
	var generatedAt, endedAt time.Time
	var metrics json.RawMessage
	if err := s.db.QueryRow(ctx, `SELECT r.generated_at,s.ended_at,
		CASE WHEN $2 THEN jsonb_set(r.metrics,'{team}',(
			SELECT jsonb_agg(CASE WHEN member->>'id'=$3 THEN member
				ELSE member - ARRAY['checked_in_at','checked_out_at','ended_automatically','work_minutes'] END ORDER BY sort)
			FROM jsonb_array_elements(r.metrics->'team') WITH ORDINALITY AS team(member,sort)
		)) ELSE r.metrics END FROM shift_summaries r JOIN shifts s ON s.id=r.shift_id WHERE r.shift_id=$1`,
		sid, p.Role == "sampler", p.ID).Scan(&generatedAt, &endedAt, &metrics); err != nil {
		return err
	}
	writeJSON(w, 200, map[string]any{"generated_at": generatedAt, "ended_at": endedAt, "metrics": metrics})
	return nil
}

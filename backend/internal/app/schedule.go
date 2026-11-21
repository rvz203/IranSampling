package app

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
)

type shiftHours struct {
	StartsAt      time.Time  `json:"starts_at"`
	EndsAt        time.Time  `json:"ends_at"`
	BreakStartsAt *time.Time `json:"break_starts_at"`
	BreakEndsAt   *time.Time `json:"break_ends_at"`
}

func (h shiftHours) validate() error {
	if h.StartsAt.IsZero() || !h.EndsAt.After(h.StartsAt) || h.EndsAt.Sub(h.StartsAt) > 24*time.Hour {
		return bad("بازه کار شیفت باید بین صفر و ۲۴ ساعت باشد / Shift must run for up to 24 hours")
	}
	if h.BreakStartsAt == nil && h.BreakEndsAt == nil {
		return nil
	}
	if h.BreakStartsAt == nil || h.BreakEndsAt == nil || !h.BreakStartsAt.After(h.StartsAt) ||
		!h.BreakEndsAt.After(*h.BreakStartsAt) || !h.BreakEndsAt.Before(h.EndsAt) {
		return bad("شروع و پایان استراحت باید داخل بازه کار شیفت باشد / The break must fall within working hours")
	}
	return nil
}

func sameTime(a, b *time.Time) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Equal(*b)
}

func duringBreak(at time.Time, start, end *time.Time) bool {
	return start != nil && end != nil && !at.Before(*start) && at.Before(*end)
}

func checkCampaignHours(ctx context.Context, tx pgx.Tx, campaign string, h shiftHours, existing bool) error {
	var valid bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM campaigns WHERE id=$1 AND ($4 OR status NOT IN('completed','paused'))
		AND ($2::timestamptz AT TIME ZONE 'Asia/Tehran')::date>=start_date AND ($3::timestamptz AT TIME ZONE 'Asia/Tehran')::date<=end_date)`,
		campaign, h.StartsAt, h.EndsAt, existing).Scan(&valid); err != nil {
		return err
	}
	if !valid {
		return bad("شیفت باید در بازه تاریخ کمپین باشد / Shift must fall within the campaign dates")
	}
	return nil
}

// Serialize roster writes so two schedules cannot claim the same sampler at once.
func lockRoster(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(8291074)")
	return err
}

func (s *Server) updateShiftSchedule(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if p.Role != "admin" {
		return forbidden()
	}
	var b struct {
		shiftHours
		SupervisorID string   `json:"supervisor_id"`
		PersonIDs    []string `json:"person_ids"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if err := b.shiftHours.validate(); err != nil {
		return err
	}
	if b.PersonIDs == nil {
		return bad("فهرست تیم را مشخص کنید / Provide the shift roster")
	}
	ctx := r.Context()
	sid := r.PathValue("id")
	err := s.transaction(r, func(tx pgx.Tx) error {
		if err := lockRoster(ctx, tx); err != nil {
			return err
		}
		var old shiftHours
		var campaign, supervisor, status string
		var ended *time.Time
		var capacity int
		var now time.Time
		if err := tx.QueryRow(ctx, `SELECT campaign_id,supervisor_id,status,required_staff,starts_at,ends_at,break_starts_at,break_ends_at,ended_at,clock_timestamp()
			FROM shifts WHERE id=$1 FOR UPDATE`, sid).Scan(&campaign, &supervisor, &status, &capacity, &old.StartsAt, &old.EndsAt, &old.BreakStartsAt, &old.BreakEndsAt, &ended, &now); err != nil {
			return err
		}
		if status == "completed" || ended != nil || !now.Before(old.EndsAt) || !now.Before(b.EndsAt) {
			return bad("برنامه شیفت پایان‌یافته قابل تغییر نیست / An ended shift cannot be rescheduled")
		}
		if err := checkReportLock(r, tx, sid); err != nil {
			return err
		}
		if len(b.PersonIDs) > capacity {
			return bad("تعداد سمپلرها بیشتر از ظرفیت شیفت است / The roster exceeds shift capacity")
		}
		var attended, removed bool
		if err := tx.QueryRow(ctx, `SELECT count(*)>0,COALESCE(bool_or(person_id<>$3 AND NOT(person_id=ANY($2::text[]))),false)
			FROM attendance WHERE shift_id=$1`, sid, b.PersonIDs, b.SupervisorID).Scan(&attended, &removed); err != nil {
			return err
		}
		if removed || (attended && (!b.StartsAt.Equal(old.StartsAt) || b.SupervisorID != supervisor)) {
			return bad("پس از ثبت حضور، شروع شیفت و سرپرست ثابت است و نیروی حاضر حذف نمی‌شود / Keep the start time, supervisor and checked-in staff after attendance begins")
		}
		breakChanged := !sameTime(old.BreakStartsAt, b.BreakStartsAt) || !sameTime(old.BreakEndsAt, b.BreakEndsAt)
		if attended && breakChanged &&
			((old.BreakStartsAt != nil && !now.Before(*old.BreakStartsAt)) ||
				(b.BreakStartsAt != nil && !now.Before(*b.BreakStartsAt))) {
			return bad("فقط بازه استراحت آینده قابل تغییر است / Change the break before it starts")
		}
		if err := checkCampaignHours(ctx, tx, campaign, b.shiftHours, true); err != nil {
			return err
		}
		var leaderOK, overlap bool
		var teamCount int
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM people WHERE id=$1 AND role='supervisor' AND (active OR id=$3)),
			(SELECT count(*) FROM people p WHERE id=ANY($2::text[]) AND role='sampler' AND
				(active OR EXISTS(SELECT 1 FROM assignments a WHERE a.person_id=p.id AND a.shift_id=$4))),
			EXISTS(SELECT 1 FROM assignments a JOIN shifts other ON other.id=a.shift_id
				WHERE a.person_id=ANY($2::text[]) AND other.id<>$4 AND other.status<>'completed' AND other.ended_at IS NULL
				AND other.starts_at<$6 AND other.ends_at>$5)`, b.SupervisorID, b.PersonIDs, supervisor, sid, b.StartsAt, b.EndsAt).Scan(&leaderOK, &teamCount, &overlap); err != nil {
			return err
		}
		if !leaderOK || teamCount != len(b.PersonIDs) {
			return bad("سرپرست و سمپلرهای معتبر و یکتا را انتخاب کنید / Select a valid supervisor and distinct samplers")
		}
		if overlap {
			return bad("یکی از نیروها در این بازه شیفت دیگری دارد / A sampler has an overlapping shift")
		}
		if _, err := tx.Exec(ctx, `UPDATE shifts SET supervisor_id=$2,starts_at=$3,ends_at=$4,break_starts_at=$5,break_ends_at=$6 WHERE id=$1`,
			sid, b.SupervisorID, b.StartsAt, b.EndsAt, b.BreakStartsAt, b.BreakEndsAt); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM assignments WHERE shift_id=$1 AND NOT(person_id=ANY($2::text[]))`, sid, b.PersonIDs); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO assignments(shift_id,person_id) SELECT $1,unnest($2::text[]) ON CONFLICT DO NOTHING`, sid, b.PersonIDs); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE tracking_sessions t SET expires_at=$2 FROM attendance a
			WHERE t.attendance_id=a.id AND a.shift_id=$1 AND t.stopped_at IS NULL`, sid, b.EndsAt); err != nil {
			return err
		}
		return audit(ctx, tx, p, "shift_schedule", "shift", sid, "برنامه کار، استراحت و تیم شیفت به‌روز شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

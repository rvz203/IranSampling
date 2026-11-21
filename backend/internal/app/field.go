package app

import (
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func validCoordinates(lat, lon float64) bool {
	return !math.IsNaN(lat) && !math.IsNaN(lon) && !math.IsInf(lat, 0) && !math.IsInf(lon, 0) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}
func distanceMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earth = 6371000
	rad := math.Pi / 180
	dlat := (lat2 - lat1) * rad
	dlon := (lon2 - lon1) * rad
	a := math.Sin(dlat/2)*math.Sin(dlat/2) + math.Cos(lat1*rad)*math.Cos(lat2*rad)*math.Sin(dlon/2)*math.Sin(dlon/2)
	return earth * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

type geoBody struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Accuracy  float64 `json:"accuracy"`
}

func validGeo(b geoBody) error {
	if !validCoordinates(b.Latitude, b.Longitude) || b.Accuracy <= 0 || b.Accuracy > 150 || math.IsNaN(b.Accuracy) || math.IsInf(b.Accuracy, 0) {
		return bad("موقعیت دقیق‌تر از ۱۵۰ متر لازم است؛ GPS را روشن و دوباره تلاش کنید / GPS accuracy must be within 150 metres")
	}
	return nil
}

// Call with the shift row locked so review and operational writes cannot race.
func checkReportLock(r *http.Request, tx pgx.Tx, sid string) error {
	var frozen bool
	if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM shift_reports WHERE shift_id=$1 AND status IN('pending','approved'))", sid).Scan(&frozen); err != nil {
		return err
	}
	if frozen {
		return bad("گزارش در انتظار بررسی یا تأییدشده است / Shift is locked while the report is under review")
	}
	return nil
}
func (s *Server) attendancePosition(r *http.Request, tx pgx.Tx, b geoBody, arrival bool) error {
	var lat, lon float64
	var radius int
	var start, end time.Time
	var assigned bool
	var status string
	var ended *time.Time
	p := current(r)
	if err := tx.QueryRow(r.Context(), `SELECT l.latitude,l.longitude,l.radius,s.starts_at,s.ends_at, CASE WHEN $3='supervisor' THEN s.supervisor_id=$2 WHEN $3='sampler' THEN EXISTS(SELECT 1 FROM assignments a WHERE a.shift_id=s.id AND a.person_id=$2) ELSE false END,s.status,s.ended_at FROM shifts s JOIN locations l ON l.id=s.location_id WHERE s.id=$1 FOR UPDATE OF s`, r.PathValue("id"), p.ID, p.Role).Scan(&lat, &lon, &radius, &start, &end, &assigned, &status, &ended); err != nil {
		return err
	}
	if !assigned {
		return forbidden()
	}
	if status == "completed" || ended != nil {
		return bad("شیفت پایان یافته است / Shift is completed")
	}
	now := time.Now()
	if arrival && (now.Before(start.Add(-time.Hour)) || !now.Before(end)) {
		return bad("ثبت حضور خارج از بازه شیفت مجاز نیست / Attendance is outside the shift window")
	}
	if distanceMeters(lat, lon, b.Latitude, b.Longitude) > float64(radius) {
		return bad("خارج از محدوده نقطه اجرا هستید / You are outside the location geofence")
	}
	return nil
}
func (s *Server) checkIn(w http.ResponseWriter, r *http.Request) error {
	var b geoBody
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if err := validGeo(b); err != nil {
		return err
	}
	p := current(r)
	err := s.transaction(r, func(tx pgx.Tx) error {
		// Serialize this person's arrivals, including requests for different shifts.
		var personID string
		if err := tx.QueryRow(r.Context(), "SELECT id FROM people WHERE id=$1 FOR NO KEY UPDATE", p.ID).Scan(&personID); err != nil {
			return err
		}
		if err := s.attendancePosition(r, tx, b, true); err != nil {
			return err
		}
		if err := checkReportLock(r, tx, r.PathValue("id")); err != nil {
			return err
		}
		var other bool
		if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM attendance WHERE person_id=$1 AND checked_out_at IS NULL)", p.ID).Scan(&other); err != nil {
			return err
		}
		if other {
			return bad("ابتدا از شیفت فعال قبلی خارج شوید / Check out of your current shift first")
		}
		if _, err := tx.Exec(r.Context(), "INSERT INTO attendance(id,shift_id,person_id,in_latitude,in_longitude,in_accuracy) VALUES($1,$2,$3,$4,$5,$6)", id("attendance"), r.PathValue("id"), p.ID, b.Latitude, b.Longitude, b.Accuracy); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), "UPDATE shifts SET status='active' WHERE id=$1", r.PathValue("id")); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "check_in", "shift", r.PathValue("id"), p.Name+" ثبت ورود کرد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]bool{"ok": true})
	return nil
}
func (s *Server) checkOut(w http.ResponseWriter, r *http.Request) error {
	var b geoBody
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if err := validGeo(b); err != nil {
		return err
	}
	p := current(r)
	err := s.transaction(r, func(tx pgx.Tx) error {
		if err := s.attendancePosition(r, tx, b, false); err != nil {
			return err
		}
		tag, err := tx.Exec(r.Context(), "UPDATE attendance SET checked_out_at=now(),out_latitude=$3,out_longitude=$4,out_accuracy=$5 WHERE shift_id=$1 AND person_id=$2 AND checked_out_at IS NULL", r.PathValue("id"), p.ID, b.Latitude, b.Longitude, b.Accuracy)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return bad("ورود فعال برای این شیفت پیدا نشد / No active check-in for this shift")
		}
		if _, err = tx.Exec(r.Context(), `UPDATE tracking_sessions t SET stopped_at=LEAST(a.checked_out_at,t.expires_at) FROM attendance a WHERE t.attendance_id=a.id AND a.shift_id=$1 AND a.person_id=$2 AND t.stopped_at IS NULL`, r.PathValue("id"), p.ID); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "check_out", "shift", r.PathValue("id"), p.Name+" ثبت خروج کرد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
func (s *Server) readiness(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	sid := r.PathValue("id")
	if err := s.shiftAccess(r.Context(), p, sid, true); err != nil {
		return err
	}
	err := s.transaction(r, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(r.Context(), "SELECT status FROM shifts WHERE id=$1 FOR UPDATE", sid).Scan(&status); err != nil {
			return err
		}
		if status == "completed" {
			return bad("شیفت پایان یافته است / Shift is completed")
		}
		if err := checkReportLock(r, tx, sid); err != nil {
			return err
		}
		tag, err := tx.Exec(r.Context(), "UPDATE shifts SET ready=true WHERE id=$1 AND status!='completed'", sid)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return bad("شیفت پایان یافته است / Shift is completed")
		}
		return audit(r.Context(), tx, p, "readiness", "shift", sid, "آمادگی تیم، محصول و تجهیزات تأیید شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
func (s *Server) recordStock(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	sid := r.PathValue("id")
	if err := s.shiftAccess(r.Context(), p, sid, false); err != nil {
		return err
	}
	var b struct {
		Kind     string `json:"kind"`
		Quantity int    `json:"quantity"`
		Note     string `json:"note"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	kinds := map[string]bool{"initial": true, "added": true, "distributed": true, "damaged": true, "returned": true}
	if !kinds[b.Kind] || b.Quantity < 1 || b.Quantity > 1000000 || len([]rune(b.Note)) > 1000 {
		return bad("نوع و تعداد معتبر وارد کنید / Enter a valid stock type and positive quantity")
	}
	err := s.transaction(r, func(tx pgx.Tx) error {
		var status string
		var ready bool
		if err := tx.QueryRow(r.Context(), "SELECT status,ready FROM shifts WHERE id=$1 FOR UPDATE", sid).Scan(&status, &ready); err != nil {
			return err
		}
		if status == "completed" {
			return bad("موجودی شیفت پایان‌یافته قابل تغییر نیست / Completed shift is locked")
		}
		if err := checkReportLock(r, tx, sid); err != nil {
			return err
		}
		if !isReviewer(p) {
			var present bool
			if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM attendance WHERE shift_id=$1 AND person_id=$2 AND checked_out_at IS NULL)", sid, p.ID).Scan(&present); err != nil {
				return err
			}
			if !present {
				return bad("ابتدا ورود خود را ثبت کنید / Check in before recording stock")
			}
		}
		if b.Kind == "distributed" && !ready {
			return bad("ابتدا آمادگی نقطه باید تأیید شود / Supervisor must confirm readiness first")
		}
		var balance, initialCount int
		if err := tx.QueryRow(r.Context(), "SELECT COALESCE(sum(CASE WHEN kind IN('initial','added') THEN quantity ELSE -quantity END),0)::integer,count(*) FILTER(WHERE kind='initial')::integer FROM stock_movements WHERE shift_id=$1", sid).Scan(&balance, &initialCount); err != nil {
			return err
		}
		if b.Kind == "initial" && initialCount > 0 {
			return bad("موجودی اولیه قبلاً ثبت شده؛ از افزایش موجودی استفاده کنید / Initial stock already exists; use replenishment")
		}
		if b.Kind != "initial" && b.Kind != "added" && b.Quantity > balance {
			return bad("تعداد از موجودی قابل‌استفاده بیشتر است / Quantity exceeds available stock")
		}
		if _, err := tx.Exec(r.Context(), "INSERT INTO stock_movements(id,shift_id,person_id,kind,quantity,note) VALUES($1,$2,$3,$4,$5,$6)", id("stock"), sid, p.ID, b.Kind, b.Quantity, b.Note); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "stock_"+b.Kind, "shift", sid, "گردش موجودی ثبت شد: "+b.Kind)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]bool{"ok": true})
	return nil
}
func (s *Server) submitReport(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	sid := r.PathValue("id")
	if err := s.shiftAccess(r.Context(), p, sid, false); err != nil {
		return err
	}
	var b struct {
		Summary string `json:"summary"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if len([]rune(strings.TrimSpace(b.Summary))) < 10 || len([]rune(b.Summary)) > 5000 {
		return bad("خلاصه گزارش باید ۱۰ تا ۵۰۰۰ کاراکتر باشد / Report must contain 10 to 5000 characters")
	}
	reportID := id("report")
	err := s.transaction(r, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(r.Context(), "SELECT status FROM shifts WHERE id=$1 FOR UPDATE", sid).Scan(&status); err != nil {
			return err
		}
		if status == "completed" {
			return bad("شیفت پایان یافته است / Shift is completed")
		}
		var existing string
		if err := tx.QueryRow(r.Context(), "SELECT COALESCE((SELECT status FROM shift_reports WHERE shift_id=$1),'')", sid).Scan(&existing); err != nil {
			return err
		}
		if existing == "pending" || existing == "approved" {
			return bad("گزارش قبلاً ارسال شده است / Report already submitted")
		}
		var active, evidenceCount int
		if err := tx.QueryRow(r.Context(), "SELECT count(*) FROM attendance WHERE shift_id=$1 AND checked_out_at IS NULL", sid).Scan(&active); err != nil {
			return err
		}
		if active > 0 {
			return bad("ابتدا خروج تمام نیروها را ثبت کنید / All team members must check out before submission")
		}
		if err := tx.QueryRow(r.Context(), "SELECT count(*) FROM evidence WHERE shift_id=$1", sid).Scan(&evidenceCount); err != nil {
			return err
		}
		if evidenceCount < 1 {
			return bad("حداقل یک تصویر از اجرای شیفت بارگذاری کنید / Upload at least one evidence photo")
		}
		if !isReviewer(p) {
			var attended bool
			if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM attendance WHERE shift_id=$1 AND person_id=$2 AND checked_out_at IS NOT NULL)", sid, p.ID).Scan(&attended); err != nil {
				return err
			}
			if !attended {
				return bad("ثبت ورود و خروج برای ارسال گزارش لازم است / Check-in and check-out are required")
			}
		}
		if err := tx.QueryRow(r.Context(), `INSERT INTO shift_reports(id,shift_id,submitted_by,summary) VALUES($1,$2,$3,$4) ON CONFLICT(shift_id) DO UPDATE SET summary=excluded.summary,status='pending',submitted_by=excluded.submitted_by,submitted_at=now(),reviewed_by=NULL,reviewed_at=NULL,feedback='' RETURNING id`, reportID, sid, p.ID, b.Summary).Scan(&reportID); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "report_submit", "shift", sid, "گزارش برای بررسی سرپرست ارسال شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": reportID})
	return nil
}
func (s *Server) reviewReport(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isReviewer(p) {
		return forbidden()
	}
	rid := r.PathValue("id")
	var sid string
	if err := s.db.QueryRow(r.Context(), "SELECT shift_id FROM shift_reports WHERE id=$1", rid).Scan(&sid); err != nil {
		return err
	}
	if err := s.shiftAccess(r.Context(), p, sid, true); err != nil {
		return err
	}
	var b struct {
		Status   string `json:"status"`
		Feedback string `json:"feedback"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if b.Status != "approved" && b.Status != "returned" {
		return bad("Invalid review status")
	}
	if b.Status == "returned" && len([]rune(strings.TrimSpace(b.Feedback))) < 5 {
		return bad("دلیل بازگشت گزارش را بنویسید / Provide a reason for returning the report")
	}
	err := s.transaction(r, func(tx pgx.Tx) error {
		var shiftStatus string
		if err := tx.QueryRow(r.Context(), "SELECT status FROM shifts WHERE id=$1 FOR UPDATE", sid).Scan(&shiftStatus); err != nil {
			return err
		}
		var status string
		if err := tx.QueryRow(r.Context(), "SELECT status FROM shift_reports WHERE id=$1 FOR UPDATE", rid).Scan(&status); err != nil {
			return err
		}
		if status != "pending" {
			return bad("فقط گزارش در انتظار بررسی قابل تغییر است / Only pending reports can be reviewed")
		}
		if b.Status == "approved" {
			var remaining, critical int
			if err := tx.QueryRow(r.Context(), "SELECT COALESCE(sum(CASE WHEN kind IN('initial','added') THEN quantity ELSE -quantity END),0)::integer FROM stock_movements WHERE shift_id=$1", sid).Scan(&remaining); err != nil {
				return err
			}
			if remaining != 0 {
				return bad("پیش از تأیید، موجودی پایان شیفت را با توزیع، آسیب یا برگشتی تطبیق دهید / Reconcile all remaining stock before approval")
			}
			if err := tx.QueryRow(r.Context(), "SELECT count(*) FROM issues WHERE shift_id=$1 AND priority='urgent' AND status!='resolved'", sid).Scan(&critical); err != nil {
				return err
			}
			if critical > 0 {
				return bad("ابتدا مشکلات فوری را حل کنید / Resolve urgent issues before approval")
			}
			if _, err := tx.Exec(r.Context(), "UPDATE shifts SET status='completed' WHERE id=$1", sid); err != nil {
				return err
			}
			var endedAt time.Time
			if err := tx.QueryRow(r.Context(), "SELECT LEAST(ends_at,clock_timestamp()) FROM shifts WHERE id=$1", sid).Scan(&endedAt); err != nil {
				return err
			}
			if err := closeShift(r.Context(), tx, sid, endedAt); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(r.Context(), "UPDATE shift_reports SET status=$1,feedback=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4", b.Status, b.Feedback, p.ID, rid); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "report_review", "shift", sid, "گزارش شیفت بررسی شد: "+b.Status)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

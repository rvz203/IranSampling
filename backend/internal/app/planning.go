package app

import (
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

func (s *Server) createCampaign(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isPlanner(p) {
		return forbidden()
	}
	var b struct {
		Name        string `json:"name"`
		BrandID     string `json:"brand_id"`
		ProductID   string `json:"product_id"`
		Status      string `json:"status"`
		StartDate   string `json:"start_date"`
		EndDate     string `json:"end_date"`
		Target      int    `json:"target"`
		Description string `json:"description"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	b.Name = strings.TrimSpace(b.Name)
	if len([]rune(b.Name)) < 3 || len([]rune(b.Name)) > 160 || b.Target < 1 || b.Target > 100000000 {
		return bad("نام کمپین و هدف معتبر وارد کنید / Enter a campaign name and a valid target")
	}
	start, e1 := time.Parse("2006-01-02", b.StartDate)
	end, e2 := time.Parse("2006-01-02", b.EndDate)
	if e1 != nil || e2 != nil || end.Before(start) {
		return bad("بازه زمانی معتبر نیست / Invalid date range")
	}
	if b.Status == "" {
		b.Status = "scheduled"
	}
	if b.Status != "scheduled" && b.Status != "draft" && b.Status != "active" {
		return bad("Invalid initial status")
	}
	cid := id("campaign")
	err := s.transaction(r, func(tx pgx.Tx) error {
		var compatible bool
		if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM products WHERE id=$1 AND brand_id=$2)", b.ProductID, b.BrandID).Scan(&compatible); err != nil {
			return err
		}
		if !compatible {
			return bad("محصول باید متعلق به برند انتخابی باشد / Product must belong to the selected brand")
		}
		_, err := tx.Exec(r.Context(), "INSERT INTO campaigns(id,name,brand_id,product_id,status,start_date,end_date,target,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", cid, b.Name, b.BrandID, b.ProductID, b.Status, start, end, b.Target, b.Description, p.ID)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "campaign_create", "campaign", cid, "کمپین «"+b.Name+"» ایجاد شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": cid})
	return nil
}
func (s *Server) updateCampaign(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isPlanner(p) {
		return forbidden()
	}
	var b struct {
		Status string `json:"status"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	labels := map[string]string{"active": "در حال اجرا", "paused": "متوقف‌شده", "completed": "پایان‌یافته", "scheduled": "برنامه‌ریزی‌شده", "draft": "پیش‌نویس"}
	label, valid := labels[b.Status]
	if !valid {
		return bad("Invalid campaign status")
	}
	err := s.transaction(r, func(tx pgx.Tx) error {
		var name string
		if err := tx.QueryRow(r.Context(), "UPDATE campaigns SET status=$1 WHERE id=$2 RETURNING name", b.Status, r.PathValue("id")).Scan(&name); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "campaign_update", "campaign", r.PathValue("id"), "وضعیت کمپین «"+name+"» به «"+label+"» تغییر کرد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
func (s *Server) createLocation(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isPlanner(p) {
		return forbidden()
	}
	var b struct {
		Name, City, Address string
		Latitude, Longitude float64
		Radius              int
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if len([]rune(strings.TrimSpace(b.Name))) < 2 || b.City == "" || !validCoordinates(b.Latitude, b.Longitude) || b.Radius < 50 || b.Radius > 5000 {
		return bad("نام، شهر، مختصات و شعاع ۵۰ تا ۵۰۰۰ متر را بررسی کنید / Check location fields")
	}
	lid := id("location")
	err := s.transaction(r, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), "INSERT INTO locations(id,name,city,address,latitude,longitude,radius) VALUES($1,$2,$3,$4,$5,$6,$7)", lid, b.Name, b.City, b.Address, b.Latitude, b.Longitude, b.Radius)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "location_create", "location", lid, "نقطه «"+b.Name+"» اضافه شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": lid})
	return nil
}
func (s *Server) createShift(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isPlanner(p) {
		return forbidden()
	}
	var b struct {
		shiftHours
		CampaignID    string `json:"campaign_id"`
		LocationID    string `json:"location_id"`
		SupervisorID  string `json:"supervisor_id"`
		Target        int    `json:"target"`
		RequiredStaff int    `json:"required_staff"`
		Instructions  string `json:"instructions"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if err := b.shiftHours.validate(); err != nil {
		return err
	}
	if (b.BreakStartsAt != nil || b.BreakEndsAt != nil) && p.Role != "admin" {
		return forbidden()
	}
	if b.Target < 1 || b.Target > 100000000 || b.RequiredStaff < 1 || b.RequiredStaff > 100 {
		return bad("زمان، هدف و تعداد نیروی شیفت را بررسی کنید / Invalid shift schedule")
	}
	sid := id("shift")
	err := s.transaction(r, func(tx pgx.Tx) error {
		var ok bool
		if err := tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM people WHERE id=$1 AND active AND role='supervisor')", b.SupervisorID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return bad("سرپرست معتبر انتخاب کنید / Select an active supervisor")
		}
		if err := checkCampaignHours(r.Context(), tx, b.CampaignID, b.shiftHours, false); err != nil {
			return err
		}
		_, err := tx.Exec(r.Context(), "INSERT INTO shifts(id,campaign_id,location_id,supervisor_id,starts_at,ends_at,target,required_staff,instructions,break_starts_at,break_ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", sid, b.CampaignID, b.LocationID, b.SupervisorID, b.StartsAt, b.EndsAt, b.Target, b.RequiredStaff, b.Instructions, b.BreakStartsAt, b.BreakEndsAt)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "shift_create", "shift", sid, "شیفت جدید برنامه‌ریزی شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": sid})
	return nil
}
func (s *Server) assignPerson(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isPlanner(p) {
		return forbidden()
	}
	var b struct {
		PersonID string `json:"person_id"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	sid := r.PathValue("id")
	err := s.transaction(r, func(tx pgx.Tx) error {
		if err := lockRoster(r.Context(), tx); err != nil {
			return err
		}
		var name string
		if err := tx.QueryRow(r.Context(), "SELECT name FROM people WHERE id=$1 AND active AND role='sampler' FOR UPDATE", b.PersonID).Scan(&name); err != nil {
			return err
		}
		var ended bool
		var capacity int
		if err := tx.QueryRow(r.Context(), "SELECT status='completed' OR ended_at IS NOT NULL OR ends_at<=clock_timestamp(),required_staff FROM shifts WHERE id=$1 FOR UPDATE", sid).Scan(&ended, &capacity); err != nil {
			return err
		}
		if ended {
			return bad("شیفت پایان یافته است / Shift is completed")
		}
		if err := checkReportLock(r, tx, sid); err != nil {
			return err
		}
		var count int
		if err := tx.QueryRow(r.Context(), "SELECT count(*) FROM assignments WHERE shift_id=$1", sid).Scan(&count); err != nil {
			return err
		}
		if count >= capacity {
			return bad("ظرفیت شیفت تکمیل است / Shift is fully staffed")
		}
		var overlap bool
		if err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM assignments a JOIN shifts s ON s.id=a.shift_id JOIN shifts target ON target.id=$2 WHERE a.person_id=$1 AND s.status!='completed' AND s.ended_at IS NULL AND s.starts_at<target.ends_at AND s.ends_at>target.starts_at)`, b.PersonID, sid).Scan(&overlap); err != nil {
			return err
		}
		if overlap {
			return bad("این نیرو در این بازه شیفت دیگری دارد / This person has an overlapping shift")
		}
		if _, err := tx.Exec(r.Context(), "INSERT INTO assignments(shift_id,person_id) VALUES($1,$2)", sid, b.PersonID); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "assignment", "shift", sid, name+" به شیفت تخصیص یافت")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]bool{"ok": true})
	return nil
}
func (s *Server) createPerson(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if p.Role != "admin" && p.Role != "manager" {
		return forbidden()
	}
	var b struct{ Name, Email, Username, Role, City, Phone, Password string }
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	b.Email = strings.ToLower(strings.TrimSpace(b.Email))
	b.Name = strings.TrimSpace(b.Name)
	address, err := mail.ParseAddress(b.Email)
	if err != nil || address.Address != b.Email || len(b.Email) > 254 || len([]rune(b.Name)) < 2 || !validPassword(b.Password) {
		return bad("نام، ایمیل و رمز حداقل ۱۲ کاراکتری لازم است / A name, email and 12-character password are required")
	}
	username, err := normalizeUsername(b.Username)
	if err != nil {
		return err
	}
	roles := map[string]bool{"admin": true, "manager": true, "coordinator": true, "supervisor": true, "sampler": true}
	if !roles[b.Role] || b.Role == "admin" && p.Role != "admin" {
		return forbidden()
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	pid := id("person")
	err = s.transaction(r, func(tx pgx.Tx) error {
		_, err := tx.Exec(r.Context(), "INSERT INTO people(id,name,email,username,password_hash,role,city,phone) VALUES($1,$2,$3,NULLIF($4,''),$5,$6,$7,$8)", pid, b.Name, b.Email, username, string(hash), b.Role, b.City, b.Phone)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "person_create", "person", pid, "همکار «"+b.Name+"» اضافه شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": pid})
	return nil
}
func (s *Server) createCatalog(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isPlanner(p) {
		return forbidden()
	}
	var b struct{ Kind, Name, ParentID, Color, Unit string }
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if len([]rune(strings.TrimSpace(b.Name))) < 2 {
		return bad("نام معتبر وارد کنید / Enter a name")
	}
	cid := id(b.Kind)
	err := s.transaction(r, func(tx pgx.Tx) error {
		var err error
		switch b.Kind {
		case "customer":
			_, err = tx.Exec(r.Context(), "INSERT INTO customers(id,name) VALUES($1,$2)", cid, b.Name)
		case "brand":
			if b.Color == "" {
				b.Color = "teal"
			}
			_, err = tx.Exec(r.Context(), "INSERT INTO brands(id,name,customer_id,color) VALUES($1,$2,$3,$4)", cid, b.Name, b.ParentID, b.Color)
		case "product":
			if b.Unit == "" {
				b.Unit = "نمونه"
			}
			_, err = tx.Exec(r.Context(), "INSERT INTO products(id,name,brand_id,unit) VALUES($1,$2,$3,$4)", cid, b.Name, b.ParentID, b.Unit)
		default:
			return bad("Invalid catalog type")
		}
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "catalog_create", b.Kind, cid, "«"+b.Name+"» به اطلاعات پایه اضافه شد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": cid})
	return nil
}

package app

import (
	"bytes"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (s *Server) createIssue(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	var b struct {
		ShiftID     string `json:"shift_id"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Priority    string `json:"priority"`
		OwnerID     string `json:"owner_id"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if err := s.shiftAccess(r.Context(), p, b.ShiftID, false); err != nil {
		return err
	}
	valid := map[string]bool{"low": true, "medium": true, "high": true, "urgent": true}
	if len([]rune(strings.TrimSpace(b.Title))) < 5 || len([]rune(b.Title)) > 200 || !valid[b.Priority] || len([]rune(b.Description)) > 5000 {
		return bad("عنوان، توضیح و اولویت مشکل را بررسی کنید / Check the issue title and priority")
	}
	if b.OwnerID == "" {
		if err := s.db.QueryRow(r.Context(), "SELECT supervisor_id FROM shifts WHERE id=$1", b.ShiftID).Scan(&b.OwnerID); err != nil {
			return err
		}
	}
	var ownerAllowed bool
	if err := s.db.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM people p JOIN shifts s ON s.id=$2 WHERE p.id=$1 AND p.active AND (p.role IN('admin','manager','coordinator') OR s.supervisor_id=p.id))`, b.OwnerID, b.ShiftID).Scan(&ownerAllowed); err != nil {
		return err
	}
	if !ownerAllowed {
		return bad("مسئول پیگیری باید سرپرست نقطه یا مدیر عملیات باشد / Choose the point supervisor or an operations manager")
	}
	iid := id("issue")
	err := s.transaction(r, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(r.Context(), "SELECT status FROM shifts WHERE id=$1 FOR UPDATE", b.ShiftID).Scan(&status); err != nil {
			return err
		}
		if status == "completed" {
			return bad("شیفت پایان یافته است / Shift is completed")
		}
		_, err := tx.Exec(r.Context(), "INSERT INTO issues(id,shift_id,title,description,priority,owner_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)", iid, b.ShiftID, b.Title, b.Description, b.Priority, b.OwnerID, p.ID)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "issue_create", "shift", b.ShiftID, "مشکل جدید: "+b.Title)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 201, map[string]string{"id": iid})
	return nil
}
func (s *Server) updateIssue(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	iid := r.PathValue("id")
	var sid, owner, priority string
	if err := s.db.QueryRow(r.Context(), "SELECT shift_id,owner_id,priority FROM issues WHERE id=$1", iid).Scan(&sid, &owner, &priority); err != nil {
		return err
	}
	if err := s.shiftAccess(r.Context(), p, sid, false); err != nil {
		return err
	}
	if !isReviewer(p) && p.ID != owner {
		return forbidden()
	}
	var b struct {
		Status string `json:"status"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if b.Status != "open" && b.Status != "in_progress" && b.Status != "resolved" {
		return bad("Invalid issue status")
	}
	err := s.transaction(r, func(tx pgx.Tx) error {
		var shiftStatus string
		if err := tx.QueryRow(r.Context(), "SELECT status FROM shifts WHERE id=$1 FOR UPDATE", sid).Scan(&shiftStatus); err != nil {
			return err
		}
		if shiftStatus == "completed" && priority == "urgent" && b.Status != "resolved" {
			return bad("مشکل فوریِ شیفت تأییدشده باید حل‌شده باقی بماند / Urgent issues on approved shifts must remain resolved")
		}
		_, err := tx.Exec(r.Context(), "UPDATE issues SET status=$1,updated_at=now() WHERE id=$2", b.Status, iid)
		if err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "issue_update", "shift", sid, "وضعیت مشکل تغییر کرد: "+b.Status)
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}
func (s *Server) uploadEvidence(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	sid := r.PathValue("id")
	if err := s.shiftAccess(r.Context(), p, sid, false); err != nil {
		return err
	}
	r.Body = http.MaxBytesReader(w, r.Body, 9<<20)
	if err := r.ParseMultipartForm(9 << 20); err != nil {
		return bad("تصویر باید حداکثر ۸ مگابایت باشد / Image must be at most 8 MB")
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		return bad("یک تصویر انتخاب کنید / Select an image")
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (8<<20)+1))
	if err != nil {
		return err
	}
	if len(data) > 8<<20 {
		return bad("تصویر بیش از ۸ مگابایت است / Image exceeds 8 MB")
	}
	kind := http.DetectContentType(data)
	ext := ""
	switch kind {
	case "image/jpeg":
		ext = ".jpg"
	case "image/png":
		ext = ".png"
	default:
		return bad("فقط تصویر JPEG یا PNG مجاز است / Only JPEG or PNG images are allowed")
	}
	dimensions, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || int64(dimensions.Width)*int64(dimensions.Height) > 25000000 || dimensions.Width < 1 || dimensions.Height < 1 {
		return bad("تصویر معتبر با حداکثر ۲۵ مگاپیکسل انتخاب کنید / Invalid image or image exceeds 25 megapixels")
	}
	if _, _, err = image.Decode(bytes.NewReader(data)); err != nil {
		return bad("فایل تصویر ناقص یا خراب است / Image file is incomplete or corrupt")
	}
	caption := r.FormValue("caption")
	if len([]rune(caption)) > 2000 {
		return bad("توضیح تصویر بیش از حد طولانی است / Caption is too long")
	}
	eid := id("evidence")
	filename := eid + ext
	if err = ensureDir(s.cfg.UploadDir); err != nil {
		return err
	}
	path := filepath.Join(s.cfg.UploadDir, filename)
	if err = os.WriteFile(path, data, 0600); err != nil {
		return err
	}
	err = s.transaction(r, func(tx pgx.Tx) error {
		var status string
		if err := tx.QueryRow(r.Context(), "SELECT status FROM shifts WHERE id=$1 FOR UPDATE", sid).Scan(&status); err != nil {
			return err
		}
		if status == "completed" {
			return bad("شیفت پایان یافته است / Shift is completed")
		}
		if _, err := tx.Exec(r.Context(), "INSERT INTO evidence(id,shift_id,person_id,filename,original_name,mime_type,caption) VALUES($1,$2,$3,$4,$5,$6,$7)", eid, sid, p.ID, filename, filepath.Base(header.Filename), kind, caption); err != nil {
			return err
		}
		return audit(r.Context(), tx, p, "evidence_upload", "shift", sid, "تصویر مستندات اجرا بارگذاری شد")
	})
	if err != nil {
		os.Remove(path)
		return err
	}
	writeJSON(w, 201, map[string]string{"id": eid, "url": "/api/evidence/" + eid})
	return nil
}
func (s *Server) serveEvidence(w http.ResponseWriter, r *http.Request) error {
	var sid, filename, original, kind string
	if err := s.db.QueryRow(r.Context(), "SELECT shift_id,filename,original_name,mime_type FROM evidence WHERE id=$1", r.PathValue("id")).Scan(&sid, &filename, &original, &kind); err != nil {
		return err
	}
	if err := s.shiftAccess(r.Context(), current(r), sid, false); err != nil {
		return err
	}
	if filepath.Base(filename) != filename {
		return fmt.Errorf("invalid stored evidence path")
	}
	f, err := os.Open(filepath.Join(s.cfg.UploadDir, filename))
	if err != nil {
		if os.IsNotExist(err) {
			return &apiError{404, "Image not found"}
		}
		return err
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", kind)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("inline", map[string]string{"filename": original}))
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	http.ServeContent(w, r, original, stat.ModTime(), f)
	return nil
}

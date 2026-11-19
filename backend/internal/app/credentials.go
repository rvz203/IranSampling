package app

import (
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

func normalizeUsername(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	if value != "" && !usernamePattern.MatchString(value) {
		return "", bad("نام کاربری باید ۳ تا ۳۲ نویسه انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد / Use 3–32 letters, numbers, dots, dashes or underscores")
	}
	return value, nil
}

func validPassword(password string) bool {
	return utf8.RuneCountInString(password) >= 12 && len(password) <= 72
}

func (s *Server) updateCredentials(w http.ResponseWriter, r *http.Request) error {
	actor := current(r)
	if actor.Role != "admin" {
		return forbidden()
	}
	var b struct {
		Username *string `json:"username"`
		Password string  `json:"password"`
	}
	if err := readJSON(w, r, &b); err != nil {
		return err
	}
	if b.Username == nil && b.Password == "" {
		return bad("نام کاربری یا رمز جدید را وارد کنید / Enter a username or a new password")
	}
	if b.Username != nil {
		username, err := normalizeUsername(*b.Username)
		if err != nil {
			return err
		}
		b.Username = &username
	}
	var hash string
	if b.Password != "" {
		if !validPassword(b.Password) {
			return bad("رمز عبور باید دست‌کم ۱۲ نویسه و حداکثر ۷۲ بایت باشد / Password must have at least 12 characters and at most 72 bytes")
		}
		encoded, err := bcrypt.GenerateFromPassword([]byte(b.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		hash = string(encoded)
	}
	pid := r.PathValue("id")
	err := s.transaction(r, func(tx pgx.Tx) error {
		var name string
		if err := tx.QueryRow(r.Context(), `UPDATE people SET username=CASE WHEN $2::text IS NULL THEN username ELSE NULLIF($2,'') END, password_hash=COALESCE(NULLIF($3,''),password_hash) WHERE id=$1 RETURNING name`, pid, b.Username, hash).Scan(&name); err != nil {
			return err
		}
		if hash != "" {
			if _, err := tx.Exec(r.Context(), "DELETE FROM sessions WHERE person_id=$1", pid); err != nil {
				return err
			}
			if _, err := tx.Exec(r.Context(), `UPDATE tracking_sessions t SET stopped_at=LEAST(now(),t.expires_at) FROM attendance a WHERE t.attendance_id=a.id AND a.person_id=$1 AND t.stopped_at IS NULL`, pid); err != nil {
				return err
			}
		}
		return audit(r.Context(), tx, actor, "credentials_update", "person", pid, "اطلاعات ورود «"+name+"» تغییر کرد")
	})
	if err != nil {
		return err
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
	return nil
}

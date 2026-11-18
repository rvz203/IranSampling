package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Seed supplies an explicitly enabled local demonstration. It never runs in production.
func Seed(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(8291074)"); err != nil {
		return err
	}
	var exists bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM people)").Scan(&exists); err != nil {
		return err
	}
	if exists {
		if err = reconcileDemoWorkflow(ctx, tx); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("Demo@12345!"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	people := [][]string{
		{"p-admin", "آرمان رضایی", "admin@faracode.local", "admin", "تهران", "teal"},
		{"p-manager", "نازنین احمدی", "manager@faracode.local", "manager", "تهران", "purple"},
		{"p-coordinator", "پارسا محمدی", "coordinator@faracode.local", "coordinator", "تهران", "blue"},
		{"p-supervisor", "سارا کریمی", "supervisor@faracode.local", "supervisor", "تهران", "rose"},
		{"p-supervisor2", "علی مرادی", "ali@faracode.local", "supervisor", "اصفهان", "amber"},
		{"p-sampler", "مهسا حسینی", "sampler@faracode.local", "sampler", "تهران", "purple"},
		{"p-sampler2", "امیر شریفی", "amir@faracode.local", "sampler", "تهران", "blue"},
		{"p-sampler3", "یلدا رحیمی", "yalda@faracode.local", "sampler", "تهران", "rose"},
		{"p-sampler4", "رضا صادقی", "reza@faracode.local", "sampler", "اصفهان", "amber"},
		{"p-sampler5", "هلیا جعفری", "helia@faracode.local", "sampler", "اصفهان", "teal"},
		{"p-sampler6", "کیان نوری", "kian@faracode.local", "sampler", "شیراز", "blue"},
		{"p-sampler7", "نگار موسوی", "negar@faracode.local", "sampler", "مشهد", "rose"},
	}
	for _, p := range people {
		if _, err = tx.Exec(ctx, "INSERT INTO people(id,name,email,password_hash,role,city,color,phone) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", p[0], p[1], p[2], string(hash), p[3], p[4], p[5], "09120000000"); err != nil {
			return err
		}
	}
	for _, q := range []string{
		`INSERT INTO customers VALUES ('customer-kalleh','گروه صنایع غذایی سولیکو'),('customer-sunich','عالیفرد'),('customer-nestle','نستله ایران')`,
		`INSERT INTO brands VALUES ('brand-kalleh','customer-kalleh','کاله','teal'),('brand-sunich','customer-sunich','سن‌ایچ','orange'),('brand-nestle','customer-nestle','نسکافه','brown'),('brand-solico','customer-kalleh','سولی','purple')`,
		`INSERT INTO products VALUES ('product-yogurt','brand-kalleh','ماست یونانی کاله','نمونه'),('product-juice','brand-sunich','آبمیوه طبیعی پرتقال','نمونه'),('product-coffee','brand-nestle','نسکافه گلد','فنجان'),('product-snack','brand-solico','اسنک پروتئینی سولی','نمونه')`,
		`INSERT INTO locations VALUES ('loc-palladium','پالادیوم','تهران','زعفرانیه، خیابان مقدس اردبیلی',35.7902,51.4105,500),('loc-kourosh','کوروش مال','تهران','بزرگراه شهید ستاری، پیامبر مرکزی',35.7374,51.3214,500),('loc-iranmall','ایران مال','تهران','بزرگراه شهید خرازی، ایران مال',35.7569,51.1951,700),('loc-tabiat','پل طبیعت','تهران','بزرگراه حقانی، بوستان آب و آتش',35.7548,51.4205,500),('loc-megamall','مگامال','تهران','شهرک اکباتان، فاز دو',35.7092,51.3116,500),('loc-citycenter','سیتی سنتر','اصفهان','بزرگراه دستجردی، مجموعه سیتی سنتر',32.5461,51.6896,600),('loc-setareh','ستاره فارس','شیراز','خیابان عفیف‌آباد، مجتمع ستاره فارس',29.6244,52.5002,500),('loc-almas','الماس شرق','مشهد','بلوار خیام شمالی، میدان بهارستان',36.3471,59.6104,500)`,
	} {
		if _, err = tx.Exec(ctx, q); err != nil {
			return err
		}
	}
	zone, _ := time.LoadLocation("Asia/Tehran")
	now := time.Now().In(zone)
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, zone)
	campaigns := [][]string{
		{"cmp-1", "طعم یک شروع تازه", "brand-kalleh", "product-yogurt", "active", "18000", "تجربه طعم ماست یونانی کاله در مراکز خرید منتخب؛ با لبخند، انرژی و رعایت زنجیره سرد."},
		{"cmp-2", "یک جرعه حال خوب", "brand-sunich", "product-juice", "active", "14000", "معرفی آبمیوه‌های طبیعی سن‌ایچ؛ سرو سرد و دریافت بازخورد کوتاه از مخاطبان."},
		{"cmp-3", "لحظه‌های طلایی", "brand-nestle", "product-coffee", "active", "12000", "یک فنجان نسکافه گلد و یک گفت‌وگوی خوب. آماده‌سازی ایمن و رعایت بهداشت الزامی است."},
		{"cmp-4", "انرژی در هر قدم", "brand-solico", "product-snack", "active", "8000", "ارائه نمونه اسنک پروتئینی و معرفی ترکیبات محصول در نقاط پرتردد."},
		{"cmp-5", "صبحانه با لبخند", "brand-kalleh", "product-yogurt", "scheduled", "10000", "کمپین صبحانه در مراکز خرید؛ برنامه‌ریزی و تکمیل تیم پیش از شروع."},
		{"cmp-6", "تابستانِ پرتقالی", "brand-sunich", "product-juice", "completed", "6000", "کمپین معرفی محصول و جمع‌آوری بازخورد مصرف‌کننده."},
	}
	for _, c := range campaigns {
		if _, err = tx.Exec(ctx, `INSERT INTO campaigns(id,name,brand_id,product_id,status,start_date,end_date,target,description,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::integer,$9,'p-admin')`, c[0], c[1], c[2], c[3], c[4], day.AddDate(0, 0, -10), day.AddDate(0, 0, 20), c[5], c[6]); err != nil {
			return err
		}
	}
	type shiftSeed struct {
		id, campaign, location, supervisor string
		staff                              []string
		qty                                int
	}
	shifts := []shiftSeed{
		{"shift-1", "cmp-1", "loc-palladium", "p-supervisor", []string{"p-sampler", "p-sampler2"}, 680},
		{"shift-2", "cmp-2", "loc-kourosh", "p-supervisor", []string{"p-sampler3"}, 540},
		{"shift-3", "cmp-3", "loc-iranmall", "p-supervisor", []string{"p-sampler2"}, 420},
		{"shift-4", "cmp-4", "loc-tabiat", "p-supervisor", []string{"p-sampler"}, 350},
		{"shift-5", "cmp-1", "loc-citycenter", "p-supervisor2", []string{"p-sampler4", "p-sampler5"}, 610},
		{"shift-6", "cmp-2", "loc-setareh", "p-supervisor2", []string{"p-sampler6"}, 490},
		{"shift-7", "cmp-3", "loc-almas", "p-supervisor2", []string{"p-sampler7"}, 360},
		{"shift-8", "cmp-4", "loc-megamall", "p-supervisor", []string{"p-sampler3"}, 270},
	}
	for i, s := range shifts {
		if _, err = tx.Exec(ctx, `INSERT INTO shifts(id,campaign_id,location_id,supervisor_id,starts_at,ends_at,target,required_staff,instructions,ready,status) VALUES($1,$2,$3,$4,$5,$6,1000,$7,'لباس فرم، کارت شناسایی و محصولات را پیش از شروع بررسی کنید. هر دو ساعت یک گزارش کوتاه ثبت کنید.',true,'active')`, s.id, s.campaign, s.location, s.supervisor, day.Add(9*time.Hour), day.Add(22*time.Hour), len(s.staff)); err != nil {
			return err
		}
		for _, p := range s.staff {
			if _, err = tx.Exec(ctx, `INSERT INTO assignments(shift_id,person_id) VALUES($1,$2)`, s.id, p); err != nil {
				return err
			}
		}
		if _, err = tx.Exec(ctx, `INSERT INTO attendance(id,shift_id,person_id,checked_in_at,in_latitude,in_longitude,in_accuracy) SELECT $1,$2,$3,$4,l.latitude,l.longitude,15 FROM locations l WHERE l.id=$5`, fmt.Sprintf("att-%d", i), s.id, s.staff[0], day.Add(9*time.Hour+time.Duration(i*3)*time.Minute), s.location); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(id,shift_id,person_id,kind,quantity,created_at) VALUES($1,$2,$3,'initial',1200,$4),($5,$2,$3,'distributed',$6,$7)`, fmt.Sprintf("stock-in-%d", i), s.id, s.staff[0], day.Add(9*time.Hour), fmt.Sprintf("stock-out-%d", i), s.qty, now.Add(-time.Duration(i*9+10)*time.Minute)); err != nil {
			return err
		}
	}
	for d := 1; d <= 13; d++ {
		id := fmt.Sprintf("history-%d", d)
		qty := 900 + (d*137)%1200
		date := day.AddDate(0, 0, -d)
		if _, err = tx.Exec(ctx, `INSERT INTO shifts(id,campaign_id,location_id,supervisor_id,starts_at,ends_at,target,required_staff,status,ready,instructions) VALUES($1,'cmp-1','loc-palladium','p-supervisor',$2,$3,2200,1,'completed',true,'اجرای کمپین طبق دستورالعمل')`, id, date.Add(9*time.Hour), date.Add(18*time.Hour)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO assignments VALUES($1,'p-sampler',true)`, id); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO stock_movements(id,shift_id,person_id,kind,quantity,created_at) VALUES($1,$2,'p-sampler','initial',$3,$4),($5,$2,'p-sampler','distributed',$3,$6)`, id+"-in", id, qty, date.Add(9*time.Hour), id+"-dist", date.Add(17*time.Hour)); err != nil {
			return err
		}
		status := "approved"
		if d <= 2 {
			status = "pending"
		}
		if _, err = tx.Exec(ctx, `INSERT INTO shift_reports(id,shift_id,submitted_by,summary,status,submitted_at) VALUES($1,$2,'p-sampler','اجرای کامل برنامه، تحویل نمونه‌ها و جمع‌آوری بازخورد مخاطبان. موجودی پایان شیفت تطبیق داده شد.',$3,$4)`, id+"-report", id, status, date.Add(18*time.Hour)); err != nil {
			return err
		}
	}
	for i, v := range [][]string{
		{"shift-2", "نیاز به تأمین مجدد آبمیوه", "موجودی یخچال به حداقل رسیده؛ لطفاً هماهنگی ارسال انجام شود.", "high", "open", "p-supervisor"},
		{"shift-3", "تأخیر در آماده‌سازی غرفه", "هماهنگی با مدیریت مرکز خرید برای دسترسی برق.", "medium", "in_progress", "p-coordinator"},
		{"shift-5", "کارت شناسایی نیروی جایگزین", "ارسال کارت پیش از شیفت عصر نیاز است.", "low", "open", "p-supervisor2"},
	} {
		if _, err = tx.Exec(ctx, `INSERT INTO issues(id,shift_id,title,description,priority,status,owner_id,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,'p-sampler',$8)`, fmt.Sprintf("issue-%d", i+1), v[0], v[1], v[2], v[3], v[4], v[5], now.Add(-time.Duration((i+1)*22)*time.Minute)); err != nil {
			return err
		}
	}
	for i, v := range [][]string{
		{"p-supervisor", "readiness", "shift", "shift-1", "آمادگی نقطه پالادیوم تأیید شد"},
		{"p-sampler3", "distribution", "shift", "shift-2", "۵۴۰ نمونه سن‌ایچ در کوروش مال توزیع شد"},
		{"p-supervisor2", "report_review", "report", "history-3-report", "گزارش شیفت سیتی سنتر تأیید شد"},
		{"p-sampler", "check_in", "shift", "shift-1", "مهسا حسینی در پالادیوم ثبت ورود کرد"},
		{"p-admin", "campaign_create", "campaign", "cmp-5", "کمپین «صبحانه با لبخند» برنامه‌ریزی شد"},
	} {
		if _, err = tx.Exec(ctx, `INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,detail,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)`, fmt.Sprintf("event-%d", i), v[0], v[1], v[2], v[3], v[4], now.Add(-time.Duration(i*17+4)*time.Minute)); err != nil {
			return err
		}
	}
	if err = reconcileDemoWorkflow(ctx, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Reconcile only the original, identifiable demonstration records. User-created
// records use different IDs and are never reset when the demo server restarts.
func reconcileDemoWorkflow(ctx context.Context, tx pgx.Tx) error {
	var demo bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM people WHERE id='p-admin' AND email='admin@faracode.local')").Scan(&demo); err != nil || !demo {
		return err
	}
	changed := int64(0)
	queries := []string{
		`UPDATE shifts s SET status='active' FROM shift_reports r WHERE r.shift_id=s.id AND s.id ~ '^history-([1-9]|1[0-3])$' AND r.id=s.id||'-report' AND r.submitted_by='p-sampler' AND r.status IN('pending','returned') AND s.status='completed'`,
		`INSERT INTO attendance(id,shift_id,person_id,checked_in_at,checked_out_at,in_latitude,in_longitude,in_accuracy,out_latitude,out_longitude,out_accuracy)
		 SELECT 'demo-attendance-'||s.id,s.id,'p-sampler',s.starts_at+interval '5 minutes',s.ends_at-interval '5 minutes',l.latitude,l.longitude,15,l.latitude,l.longitude,15
		 FROM shifts s JOIN locations l ON l.id=s.location_id JOIN shift_reports r ON r.shift_id=s.id
		 WHERE s.id ~ '^history-([1-9]|1[0-3])$' AND r.id=s.id||'-report' AND r.submitted_by='p-sampler'
		 ON CONFLICT(shift_id,person_id) DO NOTHING`,
		`WITH arrivals AS (
		 SELECT id,LEAD(checked_in_at) OVER(PARTITION BY person_id ORDER BY checked_in_at,id) next_arrival FROM attendance WHERE id ~ '^att-[0-7]$' AND checked_out_at IS NULL
		 ) UPDATE attendance a SET checked_out_at=GREATEST(a.checked_in_at,x.next_arrival-interval '1 second'),out_latitude=a.in_latitude,out_longitude=a.in_longitude,out_accuracy=a.in_accuracy
		 FROM arrivals x WHERE a.id=x.id AND x.next_arrival IS NOT NULL`,
	}
	for _, query := range queries {
		tag, err := tx.Exec(ctx, query)
		if err != nil {
			return err
		}
		changed += tag.RowsAffected()
	}
	if changed > 0 {
		_, err := tx.Exec(ctx, `INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,detail) VALUES('demo-workflow-repair-v2','p-admin','demo_reconcile','demo','original-seed','اصلاح وضعیت گزارش‌ها و سوابق حضورِ داده‌های آزمایشی اولیه') ON CONFLICT(id) DO NOTHING`)
		return err
	}
	return nil
}

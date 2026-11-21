package app

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

const visibleShift = `($1::boolean OR s.supervisor_id=$2 OR EXISTS(SELECT 1 FROM assignments a WHERE a.shift_id=s.id AND a.person_id=$2))`
const visibleCampaign = `($1::boolean OR EXISTS(SELECT 1 FROM shifts s WHERE s.campaign_id=c.id AND ` + visibleShift + `))`

func (s *Server) workspace(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	ctx := r.Context()
	out := map[string]any{"user": p, "demo": s.cfg.Demo, "server_time": time.Now().UTC(), "map_available": s.mapReady()}
	queries := map[string]string{
		"customers": `SELECT * FROM customers ORDER BY name`,
		"brands":    `SELECT * FROM brands ORDER BY name`,
		"products":  `SELECT * FROM products ORDER BY name`,
		"campaigns": `SELECT c.*,b.name brand_name,b.color,pr.name product_name,cu.name customer_name,COALESCE(x.distributed,0)::integer distributed,COALESCE(x.points,0)::integer points
			FROM campaigns c JOIN brands b ON b.id=c.brand_id JOIN products pr ON pr.id=c.product_id JOIN customers cu ON cu.id=b.customer_id
			LEFT JOIN LATERAL(SELECT count(DISTINCT s.location_id) points,sum(m.distributed) distributed FROM shifts s
				LEFT JOIN LATERAL(SELECT sum(quantity) distributed FROM stock_movements WHERE shift_id=s.id AND kind='distributed') m ON true
				WHERE s.campaign_id=c.id AND ` + visibleShift + `) x ON true WHERE ` + visibleCampaign + ` ORDER BY c.created_at DESC,c.id`,
		"locations": `SELECT l.* FROM locations l WHERE $1 OR EXISTS(SELECT 1 FROM shifts s WHERE s.location_id=l.id AND ` + visibleShift + `) ORDER BY l.city,l.name`,
		"people":    `SELECT p.id,p.name,CASE WHEN $1 OR p.id=$2 THEN p.email ELSE '' END email,CASE WHEN $3 OR p.id=$2 THEN COALESCE(p.username,'') ELSE '' END username,p.role,p.city,p.color,p.active,CASE WHEN $1 OR p.id=$2 THEN p.phone ELSE '' END phone FROM people p WHERE $1 OR p.id=$2 OR EXISTS(SELECT 1 FROM assignments a JOIN shifts s ON s.id=a.shift_id WHERE a.person_id=p.id AND ` + visibleShift + `) OR EXISTS(SELECT 1 FROM shifts s WHERE s.supervisor_id=p.id AND ` + visibleShift + `) ORDER BY p.created_at,p.id`,
		"shifts": `SELECT s.*,c.name campaign_name,b.name brand_name,b.color,l.name location_name,l.city,l.address,l.latitude,l.longitude,l.radius,p.name supervisor_name,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p2.id,'name',p2.name,'color',p2.color,'confirmed',a.confirmed)) FROM assignments a JOIN people p2 ON p2.id=a.person_id WHERE a.shift_id=s.id),'[]') team,
   COALESCE((SELECT sum(quantity) FROM stock_movements m WHERE m.shift_id=s.id AND m.kind='distributed'),0)::integer distributed,
   COALESCE((SELECT sum(CASE WHEN kind IN('initial','added') THEN quantity ELSE -quantity END) FROM stock_movements m WHERE m.shift_id=s.id),0)::integer remaining,
   COALESCE((SELECT sum(quantity) FROM stock_movements m WHERE m.shift_id=s.id AND kind IN('initial','added')),0)::integer received,
   COALESCE((SELECT sum(quantity) FROM stock_movements m WHERE m.shift_id=s.id AND kind='damaged'),0)::integer damaged,
   COALESCE((SELECT sum(quantity) FROM stock_movements m WHERE m.shift_id=s.id AND kind='returned'),0)::integer returned,
   (SELECT count(*)::integer FROM attendance at WHERE at.shift_id=s.id AND at.checked_out_at IS NULL) present,
   (SELECT status FROM shift_reports sr WHERE sr.shift_id=s.id) report_status
   FROM shifts s JOIN campaigns c ON c.id=s.campaign_id JOIN brands b ON b.id=c.brand_id JOIN locations l ON l.id=s.location_id JOIN people p ON p.id=s.supervisor_id WHERE ` + visibleShift + ` AND s.starts_at>now()-interval '90 days' ORDER BY s.starts_at DESC,s.id`,
		"attendance": `SELECT at.*,p.name person_name,l.name location_name,c.name campaign_name FROM attendance at JOIN people p ON p.id=at.person_id JOIN shifts s ON s.id=at.shift_id JOIN locations l ON l.id=s.location_id JOIN campaigns c ON c.id=s.campaign_id WHERE ` + visibleShift + ` AND ($1 OR s.supervisor_id=$2 OR at.person_id=$2) ORDER BY at.checked_in_at DESC LIMIT 500`,
		"stock":      `SELECT m.*,p.name person_name,l.name location_name,c.name campaign_name FROM stock_movements m JOIN people p ON p.id=m.person_id JOIN shifts s ON s.id=m.shift_id JOIN locations l ON l.id=s.location_id JOIN campaigns c ON c.id=s.campaign_id WHERE ` + visibleShift + ` ORDER BY m.created_at DESC LIMIT 1000`,
		"reports":    `SELECT sr.*,p.name submitted_name,l.name location_name,l.city,c.name campaign_name,b.name brand_name FROM shift_reports sr JOIN people p ON p.id=sr.submitted_by JOIN shifts s ON s.id=sr.shift_id JOIN locations l ON l.id=s.location_id JOIN campaigns c ON c.id=s.campaign_id JOIN brands b ON b.id=c.brand_id WHERE ` + visibleShift + ` ORDER BY sr.submitted_at DESC LIMIT 300`,
		"shift_summaries": `SELECT r.shift_id,r.generated_at,s.ended_at,l.name location_name,c.name campaign_name,(r.metrics->>'distributed')::bigint distributed,
			jsonb_array_length(r.metrics->'team') team_count FROM shift_summaries r JOIN shifts s ON s.id=r.shift_id
			JOIN locations l ON l.id=s.location_id JOIN campaigns c ON c.id=s.campaign_id WHERE ` + visibleShift + ` ORDER BY s.ended_at DESC,s.id LIMIT 300`,
		"issues":   `SELECT i.*,p.name owner_name,l.name location_name,l.city,c.name campaign_name FROM issues i JOIN people p ON p.id=i.owner_id JOIN shifts s ON s.id=i.shift_id JOIN locations l ON l.id=s.location_id JOIN campaigns c ON c.id=s.campaign_id WHERE ` + visibleShift + ` ORDER BY CASE i.status WHEN 'resolved' THEN 1 ELSE 0 END,CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,i.created_at DESC LIMIT 300`,
		"evidence": `SELECT e.*,p.name person_name,l.name location_name FROM evidence e JOIN people p ON p.id=e.person_id JOIN shifts s ON s.id=e.shift_id JOIN locations l ON l.id=s.location_id WHERE ` + visibleShift + ` ORDER BY e.created_at DESC LIMIT 300`,
		"events":   `SELECT e.*,p.name actor_name,p.color FROM audit_events e JOIN people p ON p.id=e.actor_id WHERE $1 OR e.actor_id=$2 OR(e.entity_type='shift' AND EXISTS(SELECT 1 FROM shifts s WHERE s.id=e.entity_id AND ` + visibleShift + `)) ORDER BY e.created_at DESC LIMIT 30`,
		"trend":    `SELECT to_char(d.day,'YYYY-MM-DD') date,COALESCE((SELECT sum(m.quantity) FROM stock_movements m JOIN shifts s ON s.id=m.shift_id WHERE m.kind='distributed' AND (m.created_at AT TIME ZONE 'Asia/Tehran')::date=d.day::date AND ` + visibleShift + `),0)::integer distributed FROM generate_series(((now() AT TIME ZONE 'Asia/Tehran')::date-13)::timestamp,(now() AT TIME ZONE 'Asia/Tehran')::date::timestamp,'1 day') d(day) ORDER BY d.day`,
	}
	for key, q := range queries {
		var raw []byte
		// Simple catalog queries have no scope placeholders. All operational records are scoped in SQL.
		args := []any{isPlanner(p), p.ID}
		if key == "customers" || key == "brands" || key == "products" {
			args = nil
		} else if key == "people" {
			args = append(args, p.Role == "admin")
		}
		if err := s.db.QueryRow(ctx, "SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) FROM ("+q+") t", args...).Scan(&raw); err != nil {
			return err
		}
		out[key] = json.RawMessage(raw)
	}
	writeJSON(w, 200, out)
	return nil
}

func safeCell(v string) string {
	if len(v) > 0 && (v[0] == '=' || v[0] == '+' || v[0] == '-' || v[0] == '@' || v[0] == '\t' || v[0] == '\r') {
		return "'" + v
	}
	return v
}
func (s *Server) exportCSV(w http.ResponseWriter, r *http.Request) error {
	p := current(r)
	if !isReviewer(p) {
		return forbidden()
	}
	days, err := strconv.Atoi(r.URL.Query().Get("days"))
	if err != nil || days < 1 || days > 365 {
		days = 30
	}
	rows, err := s.db.Query(r.Context(), `SELECT c.name,l.city,l.name,s.starts_at,s.target,COALESCE(sum(m.quantity) FILTER(WHERE m.kind='distributed'),0),COALESCE(sum(CASE WHEN m.kind IN('initial','added') THEN m.quantity ELSE -m.quantity END),0),COALESCE(sr.status,'not_submitted') FROM shifts s JOIN campaigns c ON c.id=s.campaign_id JOIN locations l ON l.id=s.location_id LEFT JOIN stock_movements m ON m.shift_id=s.id LEFT JOIN shift_reports sr ON sr.shift_id=s.id WHERE `+visibleShift+` AND s.starts_at>=now()-($3::integer*interval '1 day') AND ($4='' OR l.city=$4) GROUP BY s.id,c.name,l.city,l.name,sr.status ORDER BY s.starts_at DESC`, isPlanner(p), p.ID, days, r.URL.Query().Get("city"))
	if err != nil {
		return err
	}
	defer rows.Close()
	records := [][]string{{"Campaign / کمپین", "City / شهر", "Location / نقطه", "Shift start / شروع", "Target / هدف", "Distributed / توزیع", "Remaining / موجودی", "Review / تأیید"}}
	for rows.Next() {
		var c, city, l, status string
		var date time.Time
		var target, distributed, remaining int
		if err = rows.Scan(&c, &city, &l, &date, &target, &distributed, &remaining, &status); err != nil {
			return err
		}
		records = append(records, []string{safeCell(c), safeCell(city), safeCell(l), date.Format(time.RFC3339), strconv.Itoa(target), strconv.Itoa(distributed), strconv.Itoa(remaining), status})
	}
	if err = rows.Err(); err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="faracode-operations.csv"`)
	w.Write([]byte{0xef, 0xbb, 0xbf})
	cw := csv.NewWriter(w)
	return cw.WriteAll(records)
}

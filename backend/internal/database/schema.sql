CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS people (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','manager','coordinator','supervisor','sampler')),
 city text NOT NULL DEFAULT 'تهران', phone text NOT NULL DEFAULT '', color text NOT NULL DEFAULT 'teal',
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, person_id text NOT NULL REFERENCES people(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS customers (id text PRIMARY KEY, name text NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS brands (id text PRIMARY KEY, customer_id text NOT NULL REFERENCES customers(id), name text NOT NULL, color text NOT NULL DEFAULT 'teal');
CREATE TABLE IF NOT EXISTS products (id text PRIMARY KEY, brand_id text NOT NULL REFERENCES brands(id), name text NOT NULL, unit text NOT NULL DEFAULT 'نمونه');
CREATE TABLE IF NOT EXISTS campaigns (
 id text PRIMARY KEY, name text NOT NULL, brand_id text NOT NULL REFERENCES brands(id), product_id text NOT NULL REFERENCES products(id),
 status text NOT NULL CHECK(status IN ('draft','scheduled','active','completed','paused')) DEFAULT 'scheduled',
 start_date date NOT NULL, end_date date NOT NULL, target integer NOT NULL CHECK(target > 0),
 description text NOT NULL DEFAULT '', created_by text REFERENCES people(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date)
);
CREATE TABLE IF NOT EXISTS locations (
 id text PRIMARY KEY, name text NOT NULL, city text NOT NULL, address text NOT NULL DEFAULT '',
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 radius integer NOT NULL DEFAULT 500 CHECK(radius BETWEEN 50 AND 5000)
);
CREATE TABLE IF NOT EXISTS shifts (
 id text PRIMARY KEY, campaign_id text NOT NULL REFERENCES campaigns(id), location_id text NOT NULL REFERENCES locations(id),
 supervisor_id text NOT NULL REFERENCES people(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 target integer NOT NULL CHECK(target > 0), required_staff integer NOT NULL CHECK(required_staff > 0),
 instructions text NOT NULL DEFAULT '', ready boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','active','completed')),
 CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS shifts_starts_idx ON shifts(starts_at);
CREATE TABLE IF NOT EXISTS assignments (
 shift_id text NOT NULL REFERENCES shifts(id) ON DELETE CASCADE, person_id text NOT NULL REFERENCES people(id),
 confirmed boolean NOT NULL DEFAULT true, PRIMARY KEY(shift_id,person_id)
);
CREATE TABLE IF NOT EXISTS attendance (
 id text PRIMARY KEY, shift_id text NOT NULL REFERENCES shifts(id), person_id text NOT NULL REFERENCES people(id),
 checked_in_at timestamptz NOT NULL DEFAULT now(), checked_out_at timestamptz,
 in_latitude double precision NOT NULL, in_longitude double precision NOT NULL, in_accuracy double precision NOT NULL,
 out_latitude double precision, out_longitude double precision, out_accuracy double precision,
 UNIQUE(shift_id,person_id)
);
CREATE TABLE IF NOT EXISTS stock_movements (
 id text PRIMARY KEY, shift_id text NOT NULL REFERENCES shifts(id), person_id text NOT NULL REFERENCES people(id),
 kind text NOT NULL CHECK(kind IN ('initial','added','distributed','damaged','returned')),
 quantity integer NOT NULL CHECK(quantity > 0), note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_shift_idx ON stock_movements(shift_id);
CREATE INDEX IF NOT EXISTS stock_time_idx ON stock_movements(created_at);
CREATE TABLE IF NOT EXISTS shift_reports (
 id text PRIMARY KEY, shift_id text NOT NULL UNIQUE REFERENCES shifts(id), submitted_by text NOT NULL REFERENCES people(id),
 summary text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','returned')),
 submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_by text REFERENCES people(id), reviewed_at timestamptz, feedback text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS evidence (
 id text PRIMARY KEY, shift_id text NOT NULL REFERENCES shifts(id), person_id text NOT NULL REFERENCES people(id),
 filename text NOT NULL, original_name text NOT NULL, mime_type text NOT NULL, caption text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS issues (
 id text PRIMARY KEY, shift_id text NOT NULL REFERENCES shifts(id), title text NOT NULL, description text NOT NULL DEFAULT '',
 priority text NOT NULL CHECK(priority IN ('low','medium','high','urgent')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 owner_id text NOT NULL REFERENCES people(id), created_by text NOT NULL REFERENCES people(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
 id text PRIMARY KEY, actor_id text NOT NULL REFERENCES people(id), action text NOT NULL, entity_type text NOT NULL,
 entity_id text NOT NULL, detail text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migrations(version) VALUES(1) ON CONFLICT DO NOTHING;

ALTER TABLE people ADD COLUMN IF NOT EXISTS username text CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
CREATE UNIQUE INDEX IF NOT EXISTS people_username_unique ON people(username) WHERE username IS NOT NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'web' CHECK (client IN ('web','mobile'));
CREATE INDEX IF NOT EXISTS sessions_person_idx ON sessions(person_id);
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS client_id text;
CREATE UNIQUE INDEX IF NOT EXISTS evidence_client_unique ON evidence(shift_id,person_id,client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tracking_sessions (
 id text PRIMARY KEY, attendance_id text NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
 started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 stopped_at timestamptz, CHECK(expires_at > started_at),
 CHECK(stopped_at IS NULL OR stopped_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS tracking_open_attendance_idx ON tracking_sessions(attendance_id) WHERE stopped_at IS NULL;
CREATE INDEX IF NOT EXISTS tracking_expiry_idx ON tracking_sessions(expires_at);
CREATE TABLE IF NOT EXISTS tracking_samples (
 tracking_id text NOT NULL REFERENCES tracking_sessions(id) ON DELETE CASCADE,
 bucket bigint NOT NULL, captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 accuracy double precision NOT NULL CHECK(accuracy > 0 AND accuracy <= 1000),
 PRIMARY KEY(tracking_id,bucket)
);
CREATE INDEX IF NOT EXISTS tracking_sample_retention_idx ON tracking_samples(captured_at);
INSERT INTO schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS campaign_id text REFERENCES campaigns(id);
UPDATE audit_events e SET campaign_id=c.id FROM campaigns c
 WHERE e.campaign_id IS NULL AND e.entity_type='campaign' AND c.id=e.entity_id;
UPDATE audit_events e SET campaign_id=s.campaign_id FROM shifts s
 WHERE e.campaign_id IS NULL AND e.entity_type='shift' AND s.id=e.entity_id;
UPDATE audit_events e SET campaign_id=s.campaign_id FROM shift_reports r JOIN shifts s ON s.id=r.shift_id
 WHERE e.campaign_id IS NULL AND e.entity_type='report' AND r.id=e.entity_id;
CREATE INDEX IF NOT EXISTS audit_campaign_history_idx ON audit_events(campaign_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS shifts_campaign_idx ON shifts(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_messages (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 campaign_id text NOT NULL REFERENCES campaigns(id),
 sender_id text NOT NULL REFERENCES people(id),
 sender_name text NOT NULL, sender_role text NOT NULL,
 client_id uuid NOT NULL, body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(campaign_id,sender_id,client_id)
);
CREATE INDEX IF NOT EXISTS campaign_messages_feed_idx ON campaign_messages(campaign_id,id DESC);
INSERT INTO schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS break_starts_at timestamptz;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS break_ends_at timestamptz;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS ended_at timestamptz;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS ended_automatically boolean NOT NULL DEFAULT false;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='shifts'::regclass AND conname='shift_break_in_work_window') THEN
  ALTER TABLE shifts ADD CONSTRAINT shift_break_in_work_window CHECK (
   (break_starts_at IS NULL AND break_ends_at IS NULL) OR
   (break_starts_at IS NOT NULL AND break_ends_at IS NOT NULL AND
    starts_at < break_starts_at AND break_starts_at < break_ends_at AND break_ends_at < ends_at));
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS shifts_awaiting_close_idx ON shifts(ends_at) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS shift_summaries (
 shift_id text PRIMARY KEY REFERENCES shifts(id), generated_at timestamptz NOT NULL DEFAULT now(), metrics jsonb NOT NULL
);
INSERT INTO schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;

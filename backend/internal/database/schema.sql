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

export const FIELD_DATABASE_SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS cache (account TEXT PRIMARY KEY, workspace TEXT NOT NULL, saved_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS tracking (account TEXT PRIMARY KEY, id TEXT NOT NULL, data TEXT NOT NULL, last_bucket INTEGER);
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY, account TEXT NOT NULL, shift_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('stop','fix','photo')), payload TEXT NOT NULL,
    created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0,
    problem TEXT, rejected INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS outbox_account_idx ON outbox(account,rejected,retry_at,created_at);
`;

export const INSERT_OUTBOX =
  "INSERT INTO outbox(id,account,shift_id,kind,payload,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING";

export const PENDING_OUTBOX = `
  SELECT * FROM outbox WHERE account=? AND rejected=0 AND (? OR retry_at<=?) AND (? OR kind!='photo')
  ORDER BY CASE kind WHEN 'stop' THEN 0 WHEN 'fix' THEN 1 ELSE 2 END,created_at LIMIT 120
`;

-- Platform bootstrap (Task 3 / migration 0001)
-- Domain tables land in 0010+ (auth), 0020+ (sync), 0030+ (ai).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cloud_schema_migrations (
  version INTEGER PRIMARY KEY,
  filename TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cloud_audit_events (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT NOT NULL,
  account_id TEXT NULL,
  kind TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cloud_audit_events_request_id ON cloud_audit_events (request_id);
CREATE INDEX IF NOT EXISTS idx_cloud_audit_events_account_id ON cloud_audit_events (account_id);

-- App runtime metadata (schema version mirror for /readyz)
CREATE TABLE IF NOT EXISTS cloud_app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cloud_app_meta (key, value)
VALUES ('platform_bootstrapped', '1')
ON CONFLICT (key) DO NOTHING;

-- Restricted application role (no BYPASSRLS; future tenant RLS enforced in 0020+)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cloud_app') THEN
    CREATE ROLE cloud_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO cloud_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cloud_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cloud_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cloud_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO cloud_app;

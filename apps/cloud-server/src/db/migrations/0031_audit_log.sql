CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  account_id TEXT,
  event_type TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_account ON audit_log (account_id, created_at DESC);
CREATE INDEX idx_audit_log_event ON audit_log (event_type, created_at DESC);

-- No RLS on audit_log — only the audit service writes, reads are admin-only
GRANT INSERT ON audit_log TO cloud_app;
GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO cloud_app;
